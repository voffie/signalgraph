import { afterAll, afterEach, beforeAll, describe, expect, it } from "@effect/vitest";
import { RabbitMQBroker } from "@signalgraph/adapter-rabbitmq";
import { RabbitMQContainer, type StartedRabbitMQContainer } from "@testcontainers/rabbitmq";
import * as amqp from "amqplib";
import { Effect, Deferred } from "effect";

import { Client } from "./fixtures/generated.ts";
import type { OrderCreatedPayload } from "./fixtures/generated.ts";

async function getExistingQueues(container: StartedRabbitMQContainer): Promise<Array<string>> {
  const port = container.getMappedPort(15672);
  const response = await fetch(`http://${container.getHost()}:${port}/api/queues/`, {
    headers: {
      Authorization: `Basic ${Buffer.from("guest:guest").toString("base64")}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to list RabbitMQ queues: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();

  return data.map(({ name }: { name: string }) => name);
}

describe("RabbitMQBroker", () => {
  let rabbitmq: StartedRabbitMQContainer;

  beforeAll(async () => {
    rabbitmq = await new RabbitMQContainer("rabbitmq:4.1-management")
      .withExposedPorts(15672)
      .start();
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
        }),
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
          const client = yield* Client;
          const received = yield* Deferred.make<OrderCreatedPayload>();

          yield* client.analytics.handle(({ payload }) => Deferred.succeed(received, payload));

          yield* client.start();

          yield* client.orderCreated.publish({
            orderId: 123,
          });

          const payload = yield* Deferred.await(received);
          expect(payload).toEqual({
            orderId: 123,
          });
        }).pipe(
          Effect.provide(
            RabbitMQBroker({
              url: rabbitmq.getAmqpUrl(),
            }),
          ),
        ),
      60000,
    );
  });

  describe("fanout", () => {
    it.effect(
      "delivers to every consumer",
      () =>
        Effect.gen(function* () {
          const client = yield* Client;

          const analytics = yield* Deferred.make<boolean>();
          const billing = yield* Deferred.make<boolean>();

          yield* client.analytics.handle(() => Deferred.succeed(analytics, true));

          yield* client.billing.handle(() => Deferred.succeed(billing, true));

          yield* client.start();

          yield* client.orderCreated.publish({
            orderId: 123,
          });

          const analyticsPayload = yield* Deferred.await(analytics);
          const billingPayload = yield* Deferred.await(billing);

          expect(analyticsPayload).toBe(true);
          expect(billingPayload).toBe(true);
        }).pipe(
          Effect.provide(
            RabbitMQBroker({
              url: rabbitmq.getAmqpUrl(),
            }),
          ),
        ),
      60000,
    );
  });

  describe("ordering", () => {
    it.effect(
      "preserves message order",
      () =>
        Effect.gen(function* () {
          const client = yield* Client;

          const received: Array<number> = [];

          const finished = yield* Deferred.make<void>();

          yield* client.analytics.handle(({ payload }) =>
            Effect.gen(function* () {
              received.push(payload.orderId);

              if (received.length === 5) {
                yield* Deferred.succeed(finished, undefined);
              }
            }),
          );

          yield* client.start();

          for (const id of [1, 2, 3, 4, 5]) {
            yield* client.orderCreated.publish({
              orderId: id,
            });
          }

          yield* Deferred.await(finished);

          expect(received).toEqual([1, 2, 3, 4, 5]);
        }).pipe(
          Effect.provide(
            RabbitMQBroker({
              url: rabbitmq.getAmqpUrl(),
            }),
          ),
        ),
      60000,
    );
  });

  describe("handler scope", () => {
    it.effect(
      "each queue gets one non-competing consumer for multiple clients",
      () =>
        Effect.gen(function* () {
          const clientA = yield* Client;
          const clientB = yield* Client;

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
            }),
          );

          yield* clientB.billing.handle(({ payload }) =>
            Effect.gen(function* () {
              receivedB.push(payload.orderId);

              if (receivedB.length === 10) {
                yield* Deferred.succeed(doneB, undefined);
              }
            }),
          );

          yield* clientA.start();
          yield* clientB.start();

          for (const id of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
            yield* clientA.orderCreated.publish({
              orderId: id,
            });
          }

          yield* Deferred.await(doneA);
          yield* Deferred.await(doneB);

          expect(receivedA).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
          expect(receivedB).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
        }).pipe(
          Effect.provide(
            RabbitMQBroker({
              url: rabbitmq.getAmqpUrl(),
            }),
          ),
        ),
      60000,
    );
  });
});
