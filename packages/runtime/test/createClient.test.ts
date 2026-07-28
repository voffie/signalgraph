import { expect, layer } from "@effect/vitest";
import { Effect, Schema } from "effect";
import { message } from "signalgraph";
import { type Consumer, type Message, createClient } from "@signalgraph/runtime";
import { MemoryBroker } from "@signalgraph/adapter-memory";

const OrderCreated = message({
  name: "orders.created",
  schema: Schema.Struct({
    orderId: Schema.String
  })
});

type Order = typeof OrderCreated.schema.Type;

const createTestClient = () =>
  createClient<{
    ordersCreated: Message<Order>;
    billing: Consumer<Order>;
    analytics: Consumer<Order>;
  }>({
    ordersCreated: {
      consumers: ["analytics", "billing"],
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
      let analytics = false;
      let billing = false;
      const client = yield* createTestClient();

      yield* client.analytics.handle(() =>
        Effect.sync(() => {
          analytics = true;
        })
      );

      yield* client.billing.handle(() =>
        Effect.sync(() => {
          billing = true;
        })
      );

      yield* client.ordersCreated.publish({
        orderId: "123"
      });

      expect(analytics).toBe(true);
      expect(billing).toBe(true);
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
