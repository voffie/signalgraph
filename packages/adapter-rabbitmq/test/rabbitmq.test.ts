import { Effect, Deferred, Schema } from "effect";
import { RabbitMQContainer, type StartedRabbitMQContainer } from "@testcontainers/rabbitmq";
import { afterAll, beforeAll, describe, expect, it } from "@effect/vitest";
import { RabbitMQBroker } from "@signalgraph/adapter-rabbitmq";
import { Client } from "./fixtures/generated.ts";
import type { OrderCreatedPayload } from "./fixtures/generated.ts";
import * as amqp from "amqplib";

export class TestError extends Schema.TaggedError<TestError>()("TestError", {
  reason: Schema.String,
}) { }

describe("RabbitMQBroker", () => {
  let rabbitmq: StartedRabbitMQContainer;

  beforeAll(async () => {
    rabbitmq = await new RabbitMQContainer("rabbitmq:4.1").start();
  });

  afterAll(async () => {
    await rabbitmq.stop();
  });

  const provideBroker = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    effect.pipe(
      Effect.provide(
        RabbitMQBroker({
          url: rabbitmq.getAmqpUrl()
        })
      )
    );

  describe("publish", () => {
    it.effect("delivers a published message", () =>
      Effect.gen(function* () {
        const client = yield* Client;
        const received = yield* Deferred.make<OrderCreatedPayload>();

        yield* client.analytics.handle(({ payload }) =>
          Deferred.succeed(received, payload)
        );

        yield* client.start();

        yield* client.orderCreated.publish({
          orderId: 123
        });

        expect(yield* Deferred.await(received)).toEqual({
          orderId: 123
        });
      }).pipe(provideBroker),
      60000
    );
  });

  describe("fanout", () => {
    it.effect("delivers to every consumer", () =>
      Effect.gen(function* () {
        const client = yield* Client;

        const analytics = yield* Deferred.make<boolean>();
        const billing = yield* Deferred.make<boolean>();

        yield* client.analytics.handle(() =>
          Deferred.succeed(analytics, true)
        );

        yield* client.billing.handle(() =>
          Deferred.succeed(billing, true)
        );

        yield* client.start();

        yield* client.orderCreated.publish({
          orderId: 123
        });

        expect(yield* Deferred.await(analytics)).toBe(true);
        expect(yield* Deferred.await(billing)).toBe(true);
      }).pipe(provideBroker),
      60000
    );
  });

  describe("ordering", () => {
    it.effect("preserves message order", () =>
      Effect.gen(function* () {
        const client = yield* Client;

        const received: Array<number> = [];
        const finished = yield* Deferred.make<void>();

        yield* client.analytics.handle((({ payload }) =>
          Effect.gen(function* () {
            received.push(payload.orderId);

            if (received.length === 5) {
              yield* Deferred.succeed(finished, undefined);
            }
          })
        ));

        yield* client.start();

        for (const id of [1, 2, 3, 4, 5]) {
          yield* client.orderCreated.publish({
            orderId: id
          });
        }

        yield* Deferred.await(finished);

        expect(received).toEqual([
          1,
          2,
          3,
          4,
          5
        ]);
      }).pipe(provideBroker),
      60000
    );
  });

  describe("retry", () => {
    it.effect("retries a failed message and succeeds on a latter attempt", () =>
      Effect.gen(function* () {
        const client = yield* Client;

        let attempts = 0;
        const finished = yield* Deferred.make<void>();

        yield* client.retryingAnalytics.handle(() =>
          Effect.gen(function* () {
            attempts += 1;

            if (attempts === 2) {
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

        expect(attempts).toEqual(2);
      }).pipe(provideBroker),
      60000
    );

    it.effect("does not retry when maxAttempts is one", () =>
      Effect.gen(function* () {
        const client = yield* Client;
        const attempts = yield* Deferred.make<number>();

        yield* client.analytics.handle(() =>
          Effect.gen(function* () {
            yield* Deferred.succeed(attempts, 1);

            return yield* new TestError({ reason: "permanent failure" });
          })
        );

        yield* client.start();

        yield* client.orderCreated.publish({
          orderId: 123
        });

        expect(yield* Deferred.await(attempts)).toBe(1);
      }).pipe(provideBroker),
      60000
    );
  });

  describe("consumer isolation", () => {
    it.effect("retries only the consumer that failed", () =>
      Effect.gen(function* () {
        const client = yield* Client;

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
      }).pipe(provideBroker),
      60000
    );

    it.effect("does not redeliver a successful consumer when another consumer retries", () =>
      Effect.gen(function* () {
        const client = yield* Client;

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
      }).pipe(provideBroker),
      60000
    );
  });

  describe("DLQ", () => {
    it.effect("moves an exhausted message to the DLQ", () =>
      Effect.gen(function* () {
        const connection = yield* Effect.acquireRelease(
          Effect.tryPromise({
            try: () => amqp.connect(rabbitmq.getAmqpUrl()),
            catch: (cause) => cause
          }),
          conn => Effect.promise(() => conn.close())
        );

        const channel = yield* Effect.acquireRelease(
          Effect.tryPromise({
            try: () => connection.createChannel(),
            catch: (cause) => cause
          }),
          chan => Effect.promise(() => chan.close())
        );

        const client = yield* Client;
        const attempts = yield* Deferred.make<number>();
        const dlqMessage = yield* Deferred.make<amqp.ConsumeMessage>();

        yield* client.dlqAnalytics.handle(() =>
          Effect.gen(function* () {
            yield* Deferred.succeed(attempts, 2);

            return yield* new TestError({ reason: "permanent failure" });
          })
        );

        yield* client.start();

        yield* Effect.tryPromise(() =>
          channel.consume(
            "dlqAnalytics.dlq",
            msg => {
              if (msg) {
                channel.ack(msg);
                Deferred.doneUnsafe(
                  dlqMessage,
                  Effect.succeed(msg)
                );
              }
            }
          )
        );

        yield* client.orderCompleted.publish({
          orderId: 123
        });

        expect(yield* Deferred.await(attempts)).toBe(2);

        const msg = yield* Deferred.await(dlqMessage);

        const payload = yield* Schema.decodeUnknownEffect(
          Schema.fromJsonString(
            Schema.Struct({
              orderId: Schema.Number
            })
          )
        )(msg.content.toString("utf-8"));

        expect(payload).toEqual({
          orderId: 123
        });
      }).pipe(provideBroker),
      60000
    );
  });
});
