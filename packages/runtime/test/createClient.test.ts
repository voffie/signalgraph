import { expect, layer } from "@effect/vitest";
import { Effect, Schema } from "effect";
import { consumer, message } from "signalgraph";
import {
  type RuntimeConsumer,
  type RuntimeMessage,
  type RuntimeClient,
  createClient
} from "@signalgraph/runtime";
import { MemoryBroker } from "@signalgraph/adapter-memory";

const OrderCreated = message({
  name: "orders.created",
  schema: Schema.Struct({
    orderId: Schema.String
  })
});

const analytics = consumer({
  name: "analytics",
  message: OrderCreated
});

const billing = consumer({
  name: "billing",
  message: OrderCreated
});

type Order = typeof OrderCreated.schema.Type;

const createTestClient = () =>
  createClient<
    RuntimeClient & {
      ordersCreated: RuntimeMessage<Order>;
      billing: RuntimeConsumer<Order>;
      analytics: RuntimeConsumer<Order>;
    }>({
      ordersCreated: {
        consumers: [analytics, billing],
        definition: OrderCreated
      }
    });

layer(MemoryBroker)("createClient", (it) => {
  it.effect("creates message resources", () =>
    Effect.gen(function* () {
      const client = yield* createTestClient();
      expect(client.ordersCreated).toBeDefined();
    })
  );

  it.effect("creates consumer resources", () =>
    Effect.gen(function* () {
      const client = yield* createTestClient();
      expect(client.billing).toBeDefined();
      expect(client.analytics).toBeDefined();
    })
  );

  it.effect("publish reaches consumer", () =>
    Effect.gen(function* () {
      let received: Order | undefined;

      const client = yield* createTestClient();

      yield* client.billing.handle(({ payload }) =>
        Effect.sync(() => {
          received = payload;
        })
      );

      yield* client.start();

      yield* client.ordersCreated.publish({
        orderId: "123"
      });

      expect(received).toEqual({
        orderId: "123"
      });
    })
  );

  it.effect("supports multiple consumers", () =>
    Effect.gen(function* () {
      let analyticsHandled = false;
      let billingHandled = false;
      const client = yield* createTestClient();

      yield* client.analytics.handle(() =>
        Effect.sync(() => {
          analyticsHandled = true;
        })
      );

      yield* client.billing.handle(() =>
        Effect.sync(() => {
          billingHandled = true;
        })
      );

      yield* client.start();

      yield* client.ordersCreated.publish({
        orderId: "123"
      });

      expect(analyticsHandled).toBe(true);
      expect(billingHandled).toBe(true);
    })
  );

  it.effect("supports multiple handlers", () =>
    Effect.gen(function* () {
      let output = 0;
      const client = yield* createTestClient();

      yield* client.analytics.handle(() =>
        Effect.sync(() => {
          output += 1;
        })
      );

      yield* client.analytics.handle(() =>
        Effect.sync(() => {
          output += 1;
        })
      );

      yield* client.start();

      yield* client.ordersCreated.publish({
        orderId: "123"
      });

      expect(output).toBe(2);
    })
  );

  it.effect("ignores consumers without handlers", () =>
    Effect.gen(function* () {
      const client = yield* createTestClient();

      yield* client.ordersCreated.publish({ orderId: "123" });
    })
  );
});
