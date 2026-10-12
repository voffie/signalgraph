import { expect, layer } from "@effect/vitest";
import { MemoryBroker } from "@signalgraph/adapter-memory";
import { Deferred, Effect, Schema } from "effect";
import { consumer, message } from "signalgraph";
import { type RuntimeConsumer, type RuntimeMessage, type RuntimeClient, createClient } from "signalgraph/runtime";

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
    }
  >({
    ordersCreated: {
      consumers: [analytics, billing],
      definition: OrderCreated
    }
  });

layer(MemoryBroker())("createClient", (it) => {
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
      const received = yield* Deferred.make<Order>();
      const client = yield* createTestClient();

      yield* client.billing.handle(({ payload }) => Deferred.succeed(received, payload));

      yield* client.start();

      yield* client.ordersCreated.publish({
        orderId: "123"
      });

      const payload = yield* Deferred.await(received);

      expect(payload).toEqual({
        orderId: "123"
      });
    })
  );

  it.effect("supports multiple consumers", () =>
    Effect.gen(function* () {
      const analyticsHandled = yield* Deferred.make<boolean>();
      const billingHandled = yield* Deferred.make<boolean>();
      const client = yield* createTestClient();

      yield* client.analytics.handle(() => Deferred.succeed(analyticsHandled, true));

      yield* client.billing.handle(() => Deferred.succeed(billingHandled, true));

      yield* client.start();

      yield* client.ordersCreated.publish({
        orderId: "123"
      });

      const analyticsDone = yield* Deferred.await(analyticsHandled);
      const billingDone = yield* Deferred.await(billingHandled);

      expect(analyticsDone).toBe(true);
      expect(billingDone).toBe(true);
    })
  );

  it.effect("supports multiple handlers", () =>
    Effect.gen(function* () {
      let output = 0;
      const done = yield* Deferred.make();
      const client = yield* createTestClient();

      yield* client.analytics.handle(() =>
        Effect.sync(() => {
          output += 1;
        })
      );

      yield* client.analytics.handle(() =>
        Effect.sync(() => {
          output += 1;
        }).pipe(Effect.andThen(Deferred.succeed(done, undefined)))
      );

      yield* client.start();

      yield* client.ordersCreated.publish({
        orderId: "123"
      });

      yield* Deferred.await(done);

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
