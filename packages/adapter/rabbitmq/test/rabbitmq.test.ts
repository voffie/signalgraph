import { afterAll, afterEach, beforeAll, describe, expect, it } from "@effect/vitest";
import { RabbitMQBroker } from "@signalgraph/adapter-rabbitmq";
import { RabbitMQContainer, type StartedRabbitMQContainer } from "@testcontainers/rabbitmq";
import * as amqp from "amqplib";
import { Effect, Deferred, Option, Schema } from "effect";
import * as Broker from "signalgraph/broker";
import * as Runtime from "signalgraph/runtime";

import { Client, type OrderCreatedPayload } from "./fixtures/generated.ts";
import { Analytics, Billing, OrderCreated } from "./fixtures/schema.ts";

const RETRY_ATTEMPT_HEADER = "signalgraph-retry-attempt";

class TestError extends Schema.TaggedError<TestError>()("TestError", {
  reason: Schema.String
}) {}

async function getExistingQueues(container: StartedRabbitMQContainer): Promise<Array<string>> {
  const port = container.getMappedPort(15672);
  const response = await fetch(`http://${container.getHost()}:${port}/api/queues/`, {
    headers: {
      Authorization: `Basic ${Buffer.from("guest:guest").toString("base64")}`
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to list RabbitMQ queues: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();

  return data.map(({ name }: { name: string }) => name);
}

async function getQueueMessageCount(container: StartedRabbitMQContainer, queue: string): Promise<number> {
  const connection = await amqp.connect(container.getAmqpUrl());

  try {
    const channel = await connection.createChannel();

    try {
      return (await channel.checkQueue(queue)).messageCount;
    } finally {
      await channel.close();
    }
  } finally {
    await connection.close();
  }
}

const makeClient = Effect.gen(function* () {
  const client = yield* Client;

  yield* Effect.all(
    [
      client.analytics.handle(() => Effect.void),
      client.billing.handle(() => Effect.void),
      client.retryingAnalytics.handle(() => Effect.void),
      client.noRetryAnalytics.handle(() => Effect.void),
      client.dlqAnalytics.handle(() => Effect.void)
    ],
    { discard: true }
  );

  return client;
});

describe("RabbitMQBroker", () => {
  let rabbitmq: StartedRabbitMQContainer;

  beforeAll(async () => {
    rabbitmq = await new RabbitMQContainer("rabbitmq:4.1-management").withExposedPorts(15672).start();
  });

  afterEach(async () => {
    const queues = await getExistingQueues(rabbitmq);
    const connection = await amqp.connect(rabbitmq.getAmqpUrl());

    try {
      await Promise.all(
        queues.map(async (queue) => {
          const channel = await connection.createChannel();

          try {
            await channel.purgeQueue(queue);
          } finally {
            await channel.close();
          }
        })
      );
    } finally {
      await connection.close();
    }
  });

  afterAll(async () => {
    await rabbitmq.stop();
  });

  describe("publish", () => {
    it.effect(
      "delivers a published message",
      () =>
        Effect.gen(function* () {
          const client = yield* makeClient;
          const received = yield* Deferred.make<OrderCreatedPayload>();

          yield* client.analytics.handle(({ payload }) => Deferred.succeed(received, payload));

          yield* client.start();

          yield* client.orderCreated.publish({
            orderId: 123
          });

          const payload = yield* Deferred.await(received);
          expect(payload).toEqual({
            orderId: 123
          });
        }).pipe(
          Effect.provide(
            RabbitMQBroker({
              url: rabbitmq.getAmqpUrl()
            })
          )
        ),
      60000
    );
  });

  describe("fanout", () => {
    it.effect(
      "delivers to every consumer",
      () =>
        Effect.gen(function* () {
          const client = yield* makeClient;

          const analytics = yield* Deferred.make<boolean>();
          const billing = yield* Deferred.make<boolean>();

          yield* client.analytics.handle(() => Deferred.succeed(analytics, true));

          yield* client.billing.handle(() => Deferred.succeed(billing, true));

          yield* client.start();

          yield* client.orderCreated.publish({
            orderId: 123
          });

          const analyticsPayload = yield* Deferred.await(analytics);
          const billingPayload = yield* Deferred.await(billing);

          expect(analyticsPayload).toBe(true);
          expect(billingPayload).toBe(true);
        }).pipe(
          Effect.provide(
            RabbitMQBroker({
              url: rabbitmq.getAmqpUrl()
            })
          )
        ),
      60000
    );
  });

  describe("ordering", () => {
    it.effect(
      "preserves message order",
      () =>
        Effect.gen(function* () {
          const client = yield* makeClient;

          const received: Array<number> = [];

          const finished = yield* Deferred.make<void>();

          yield* client.analytics.handle(({ payload }) =>
            Effect.gen(function* () {
              received.push(payload.orderId);

              if (received.length === 5) {
                yield* Deferred.succeed(finished, undefined);
              }
            })
          );

          yield* client.start();

          for (const id of [1, 2, 3, 4, 5]) {
            yield* client.orderCreated.publish({
              orderId: id
            });
          }

          yield* Deferred.await(finished);

          expect(received).toEqual([1, 2, 3, 4, 5]);
        }).pipe(
          Effect.provide(
            RabbitMQBroker({
              url: rabbitmq.getAmqpUrl()
            })
          )
        ),
      60000
    );
  });

  describe("handler scope", () => {
    it.effect(
      "each queue gets one non-competing consumer for multiple clients",
      () =>
        Effect.gen(function* () {
          // Two "services" that share the order.created message but own different consumers.
          type ServiceA = Runtime.RuntimeClient & {
            orderCreated: Runtime.RuntimeMessage<OrderCreatedPayload>;
            analytics: Runtime.RuntimeConsumer<OrderCreatedPayload>;
          };
          type ServiceB = Runtime.RuntimeClient & {
            orderCreated: Runtime.RuntimeMessage<OrderCreatedPayload>;
            billing: Runtime.RuntimeConsumer<OrderCreatedPayload>;
          };

          const clientA = yield* Runtime.createClient<ServiceA>({
            "order.created": { definition: OrderCreated, consumers: [Analytics] }
          });

          const clientB = yield* Runtime.createClient<ServiceB>({
            "order.created": { definition: OrderCreated, consumers: [Billing] }
          });

          const receivedA: Array<number> = [];
          const receivedB: Array<number> = [];

          const doneA = yield* Deferred.make<void>();
          const doneB = yield* Deferred.make<void>();

          yield* clientA.analytics.handle(({ payload }) =>
            Effect.gen(function* () {
              receivedA.push(payload.orderId);

              if (receivedA.length === 10) {
                yield* Deferred.succeed(doneA, undefined);
              }
            })
          );

          yield* clientB.billing.handle(({ payload }) =>
            Effect.gen(function* () {
              receivedB.push(payload.orderId);

              if (receivedB.length === 10) {
                yield* Deferred.succeed(doneB, undefined);
              }
            })
          );

          yield* clientA.start();
          yield* clientB.start();

          for (const id of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
            yield* clientA.orderCreated.publish({
              orderId: id
            });
          }

          yield* Deferred.await(doneA);
          yield* Deferred.await(doneB);

          expect(receivedA).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
          expect(receivedB).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
        }).pipe(
          Effect.provide(
            RabbitMQBroker({
              url: rabbitmq.getAmqpUrl()
            })
          )
        ),
      60000
    );
  });

  describe("graceful shutdown", () => {
    it.live(
      "stops new deliveries",
      () =>
        Effect.gen(function* () {
          const client = yield* makeClient;
          const broker = yield* Broker.Broker;
          const received = yield* Deferred.make<void>();

          yield* client.analytics.handle(() => Deferred.succeed(received, undefined));

          yield* client.start();
          yield* broker.stop;

          yield* client.orderCreated.publish({ orderId: 1 });

          const delivery = yield* Deferred.await(received).pipe(Effect.timeoutOption("250 millis"));

          expect(Option.isNone(delivery)).toBe(true);

          yield* broker.close;

          expect(yield* Effect.promise(() => getQueueMessageCount(rabbitmq, "analytics"))).toBe(1);
        }).pipe(
          Effect.provide(
            RabbitMQBroker({
              url: rabbitmq.getAmqpUrl()
            })
          )
        ),
      60000
    );

    it.effect(
      "acknowledges a handler that finishes within the grace period",
      () =>
        Effect.gen(function* () {
          const client = yield* makeClient;
          const broker = yield* Broker.Broker;

          const started = yield* Deferred.make<void>();
          const release = yield* Deferred.make<void>();

          yield* client.analytics.handle(() =>
            Effect.gen(function* () {
              yield* Deferred.succeed(started, undefined);
              yield* Deferred.await(release);
            })
          );

          yield* client.start();

          yield* client.orderCreated.publish({ orderId: 1 });
          yield* Deferred.await(started);

          yield* broker.stop;
          yield* Deferred.succeed(release, undefined);
          yield* broker.awaitIdle;
          yield* broker.close;

          expect(yield* Effect.promise(() => getQueueMessageCount(rabbitmq, "analytics"))).toBe(0);
        }).pipe(
          Effect.provide(
            RabbitMQBroker({
              url: rabbitmq.getAmqpUrl()
            })
          )
        ),
      60000
    );

    it.effect(
      "requeues an unacknowledged message when the consumer channel closes",
      () =>
        Effect.gen(function* () {
          const client = yield* makeClient;
          const broker = yield* Broker.Broker;

          const started = yield* Deferred.make<void>();
          const release = yield* Deferred.make<void>();
          const redelivered = yield* Deferred.make<amqp.ConsumeMessage>();

          yield* client.analytics.handle(() =>
            Effect.gen(function* () {
              yield* Deferred.succeed(started, undefined);
              yield* Deferred.await(release);
            })
          );

          yield* client.start();

          yield* client.orderCreated.publish({ orderId: 1 });
          yield* Deferred.await(started);

          yield* broker.stop;
          yield* broker.close;

          const connection = yield* Effect.acquireRelease(
            Effect.promise(() => amqp.connect(rabbitmq.getAmqpUrl())),
            (connection) => Effect.promise(() => connection.close())
          );

          const channel = yield* Effect.acquireRelease(
            Effect.promise(() => connection.createChannel()),
            (channel) => Effect.promise(() => channel.close())
          );

          yield* Effect.promise(() =>
            channel.consume("analytics", (message) => {
              if (message) {
                channel.ack(message);

                Deferred.doneUnsafe(redelivered, Effect.succeed(message));
              }
            })
          );

          const message = yield* Deferred.await(redelivered);

          expect(message.fields.redelivered).toBe(true);

          yield* Deferred.succeed(release, undefined);
          yield* broker.awaitIdle;
        }).pipe(
          Effect.provide(
            RabbitMQBroker({
              url: rabbitmq.getAmqpUrl()
            })
          )
        ),
      60000
    );

    it.effect(
      "returns messages that were never started when stopping",
      () =>
        Effect.gen(function* () {
          const client = yield* makeClient;
          const broker = yield* Broker.Broker;

          const started = yield* Deferred.make<void>();
          const release = yield* Deferred.make<void>();

          yield* client.analytics.handle(() =>
            Effect.gen(function* () {
              yield* Deferred.succeed(started, undefined);
              yield* Deferred.await(release);
            })
          );

          yield* client.start();

          for (const orderId of [1, 2, 3]) {
            yield* client.orderCreated.publish({ orderId });
          }
          yield* Deferred.await(started);

          yield* broker.stop;
          yield* Deferred.succeed(release, undefined);
          yield* broker.awaitIdle;
          yield* broker.close;

          // Message 1 was acked; 2 and 3 were never handled and must still be queued.
          expect(yield* Effect.promise(() => getQueueMessageCount(rabbitmq, "analytics"))).toBe(2);
        }).pipe(Effect.provide(RabbitMQBroker({ url: rabbitmq.getAmqpUrl() }))),
      60000
    );

    it.effect(
      "close interrupts a running handler and returns its message",
      () =>
        Effect.gen(function* () {
          const client = yield* makeClient;
          const broker = yield* Broker.Broker;

          const started = yield* Deferred.make<void>();
          const never = yield* Deferred.make<void>();
          let finished = false;

          yield* client.analytics.handle(() =>
            Effect.gen(function* () {
              yield* Deferred.succeed(started, undefined);
              yield* Deferred.await(never);
            }).pipe(
              Effect.ensuring(
                Effect.sync(() => {
                  finished = true;
                })
              )
            )
          );

          yield* client.start();
          yield* client.orderCreated.publish({ orderId: 1 });
          yield* Deferred.await(started);

          yield* broker.stop;
          yield* broker.close;
          yield* broker.awaitIdle; // must not hang after a forced close

          expect(finished).toBe(true);
          expect(yield* Effect.promise(() => getQueueMessageCount(rabbitmq, "analytics"))).toBe(1);
        }).pipe(Effect.provide(RabbitMQBroker({ url: rabbitmq.getAmqpUrl() }))),
      60000
    );

    it.effect(
      "stop and close can be called repeatedly, in any order",
      () =>
        Effect.gen(function* () {
          const client = yield* makeClient;
          const broker = yield* Broker.Broker;

          yield* client.analytics.handle(() => Effect.void);
          yield* client.start();

          yield* broker.close;
          yield* broker.stop;
          yield* broker.stop;
          yield* broker.close;
          yield* broker.awaitIdle;
        }).pipe(Effect.provide(RabbitMQBroker({ url: rabbitmq.getAmqpUrl() }))),
      60000
    );

    it.effect(
      "deliver still works after stop, including from a draining handler",
      () =>
        Effect.gen(function* () {
          const client = yield* makeClient;
          const broker = yield* Broker.Broker;

          const started = yield* Deferred.make<void>();
          const release = yield* Deferred.make<void>();

          yield* client.analytics.handle(({ payload }) =>
            Effect.gen(function* () {
              yield* Deferred.succeed(started, undefined);
              yield* Deferred.await(release);
              yield* client.orderCreated.publish({ orderId: payload.orderId + 1 });
            })
          );

          yield* client.start();
          yield* client.orderCreated.publish({ orderId: 1 });
          yield* Deferred.await(started);

          yield* broker.stop;
          yield* Deferred.succeed(release, undefined);
          yield* broker.awaitIdle;
          yield* broker.close;

          // Message 1 was acked. the follow-up (2) was accepted by the broker and stays queued.
          expect(yield* Effect.promise(() => getQueueMessageCount(rabbitmq, "analytics"))).toBe(1);
        }).pipe(Effect.provide(RabbitMQBroker({ url: rabbitmq.getAmqpUrl() }))),
      60000
    );
  });

  describe("retry", () => {
    it.effect(
      "retries a failed message and succeeds on a latter attempt",
      () =>
        Effect.gen(function* () {
          const client = yield* makeClient;

          const attempts: Array<number> = [];
          const finished = yield* Deferred.make<void>();

          yield* client.retryingAnalytics.handle(({ metadata }) =>
            Effect.gen(function* () {
              attempts.push(metadata.retryAttempt);

              if (metadata.retryAttempt === 2) {
                yield* Deferred.succeed(finished, undefined);
                return;
              }

              return yield* new TestError({ reason: "temporary failure" });
            })
          );

          yield* client.start();

          yield* client.orderCreated.publish({
            orderId: 123
          });

          yield* Deferred.await(finished);

          expect(attempts).toEqual([1, 2]);
        }).pipe(
          Effect.provide(
            RabbitMQBroker({
              url: rabbitmq.getAmqpUrl()
            })
          )
        ),
      60000
    );

    it.effect(
      "handles the initial attempt when maxAttempts is one",
      () =>
        Effect.gen(function* () {
          const client = yield* makeClient;
          const attempt = yield* Deferred.make<number>();

          yield* client.noRetryAnalytics.handle(({ metadata }) =>
            Effect.gen(function* () {
              yield* Deferred.succeed(attempt, metadata.retryAttempt);

              return yield* new TestError({ reason: "permanent failure" });
            })
          );

          yield* client.start();

          yield* client.orderCreated.publish({
            orderId: 123
          });

          expect(yield* Deferred.await(attempt)).toBe(1);
        }).pipe(
          Effect.provide(
            RabbitMQBroker({
              url: rabbitmq.getAmqpUrl()
            })
          )
        ),
      60000
    );

    it.live(
      "keeps consuming after a handler throws",
      () =>
        Effect.gen(function* () {
          const client = yield* makeClient;
          const second = yield* Deferred.make<number>();
          let firstAttempts = 0;

          yield* client.dlqAnalytics.handle(({ payload }) =>
            Effect.suspend(() => {
              if (payload.orderId === 1) {
                firstAttempts += 1;
                throw new Error("handler defect"); // a defect, not a typed failure
              }
              return Deferred.succeed(second, payload.orderId);
            })
          );

          yield* client.start();
          yield* client.orderCompleted.publish({ orderId: 1 });
          yield* client.orderCompleted.publish({ orderId: 2 });

          expect(yield* Deferred.await(second)).toBe(2);

          // Message 1 needs its retry (about 100ms) before it reaches the DLQ, so poll.
          let dlqCount = 0;
          for (let i = 0; i < 50 && dlqCount !== 1; i++) {
            dlqCount = yield* Effect.promise(() => getQueueMessageCount(rabbitmq, "dlqAnalytics.dlq"));
            if (dlqCount !== 1) yield* Effect.sleep("100 millis");
          }

          expect(dlqCount).toBe(1);
          expect(firstAttempts).toBe(2);
        }).pipe(Effect.provide(RabbitMQBroker({ url: rabbitmq.getAmqpUrl() }))),
      60000
    );
  });

  describe("consumer isolation", () => {
    it.effect(
      "retries only the consumer that failed",
      () =>
        Effect.gen(function* () {
          const client = yield* makeClient;

          let retryingAttempts = 0;
          const billingReceived = yield* Deferred.make<void>();
          const retryingFinished = yield* Deferred.make<void>();

          yield* client.retryingAnalytics.handle(() =>
            Effect.gen(function* () {
              retryingAttempts += 1;

              if (retryingAttempts === 2) {
                yield* Deferred.succeed(retryingFinished, undefined);
                return;
              }

              return yield* new TestError({ reason: "temporary failure" });
            })
          );

          yield* client.billing.handle(() => {
            return Deferred.succeed(billingReceived, undefined);
          });

          yield* client.start();

          yield* client.orderCreated.publish({
            orderId: 123
          });

          yield* Deferred.await(billingReceived);
          yield* Deferred.await(retryingFinished);

          expect(retryingAttempts).toEqual(2);
        }).pipe(
          Effect.provide(
            RabbitMQBroker({
              url: rabbitmq.getAmqpUrl()
            })
          )
        ),
      60000
    );

    it.effect(
      "does not redeliver a successful consumer when another consumer retries",
      () =>
        Effect.gen(function* () {
          const client = yield* makeClient;

          let billingAttempts = 0;
          let retryingAttempts = 0;

          const billingReceived = yield* Deferred.make<void>();
          const retryingFinished = yield* Deferred.make<void>();

          yield* client.retryingAnalytics.handle(() =>
            Effect.gen(function* () {
              retryingAttempts += 1;

              if (retryingAttempts === 2) {
                yield* Deferred.succeed(retryingFinished, undefined);
                return;
              }

              return yield* new TestError({ reason: "temporary failure" });
            })
          );

          yield* client.billing.handle(() =>
            Effect.gen(function* () {
              billingAttempts += 1;
              yield* Deferred.succeed(billingReceived, undefined);
            })
          );

          yield* client.start();

          yield* client.orderCreated.publish({
            orderId: 123
          });

          yield* Deferred.await(billingReceived);
          yield* Deferred.await(retryingFinished);

          expect(billingAttempts).toBe(1);
          expect(retryingAttempts).toBe(2);
        }).pipe(
          Effect.provide(
            RabbitMQBroker({
              url: rabbitmq.getAmqpUrl()
            })
          )
        ),
      60000
    );
  });

  describe("DLQ", () => {
    it.effect(
      "moves an exhausted message to the DLQ",
      () =>
        Effect.gen(function* () {
          const connection = yield* Effect.acquireRelease(
            Effect.tryPromise({
              try: () => amqp.connect(rabbitmq.getAmqpUrl()),
              catch: (cause) => cause
            }),
            (conn) => Effect.promise(() => conn.close())
          );

          const channel = yield* Effect.acquireRelease(
            Effect.tryPromise({
              try: () => connection.createChannel(),
              catch: (cause) => cause
            }),
            (chan) => Effect.promise(() => chan.close())
          );

          const client = yield* makeClient;
          const attempts: Array<number> = [];
          const dlqMessage = yield* Deferred.make<amqp.ConsumeMessage>();

          yield* client.dlqAnalytics.handle(({ metadata }) =>
            Effect.gen(function* () {
              attempts.push(metadata.retryAttempt);

              return yield* new TestError({ reason: "permanent failure" });
            })
          );

          yield* client.start();

          yield* Effect.tryPromise(() =>
            channel.consume("dlqAnalytics.dlq", (msg) => {
              if (msg) {
                channel.ack(msg);
                Deferred.doneUnsafe(dlqMessage, Effect.succeed(msg));
              }
            })
          );

          yield* client.orderCompleted.publish({
            orderId: 123
          });

          const msg = yield* Deferred.await(dlqMessage);

          const payload = yield* Schema.decodeUnknownEffect(
            Schema.fromJsonString(
              Schema.Struct({
                orderId: Schema.Number
              })
            )
          )(msg.content.toString("utf-8"));

          expect(attempts).toStrictEqual([1, 2]);
          expect(msg.properties.headers?.[RETRY_ATTEMPT_HEADER]).toBe(2);
          expect(payload).toEqual({
            orderId: 123
          });
        }).pipe(
          Effect.provide(
            RabbitMQBroker({
              url: rabbitmq.getAmqpUrl()
            })
          )
        ),
      60000
    );
  });
});
