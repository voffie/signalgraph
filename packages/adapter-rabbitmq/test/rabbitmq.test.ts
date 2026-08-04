import { Effect, Deferred } from "effect";
import { RabbitMQContainer, type StartedRabbitMQContainer } from "@testcontainers/rabbitmq";
import { afterAll, beforeAll, describe, expect, it } from "@effect/vitest";
import { RabbitMQBroker } from "@signalgraph/adapter-rabbitmq";
import { Client } from "./fixtures/generated.ts";
import type { OrderCreatedPayload } from "./fixtures/generated.ts";


describe("RabbitMQBroker", () => {
  let rabbitmq: StartedRabbitMQContainer;

  beforeAll(async () => {
    rabbitmq = await new RabbitMQContainer("rabbitmq:4.1").start();
  });

  afterAll(async () => {
    await rabbitmq.stop();
  });

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
})
