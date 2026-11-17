import { describe, expect, it } from "@effect/vitest";
import { Deferred, Effect, Exit, Fiber, Layer, Schema } from "effect";
import { TestClock } from "effect/testing";
import { consumer, message } from "signalgraph";
import * as Broker from "signalgraph/broker";
import { type RuntimeConsumer, type RuntimeMessage, type RuntimeClient, createClient } from "signalgraph/runtime";

import { TestBroker } from "../utils/TestBroker.ts";

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

// start() requires a handler for every consumer. Handlers are appended, so a test's own
// handlers run after these no-ops.
const createHandledClient = () =>
  Effect.gen(function* () {
    const client = yield* createTestClient();
    yield* client.analytics.handle(() => Effect.void);
    yield* client.billing.handle(() => Effect.void);
    return client;
  });

const HangingStopBroker = Layer.effect(
  Broker.Broker,
  Effect.gen(function* () {
    const base = yield* Broker.Broker;
    return { ...base, stop: Effect.never };
  })
).pipe(Layer.provide(TestBroker));

describe("createClient", () => {
  it.effect("creates message resources", () =>
    Effect.gen(function* () {
      const client = yield* createTestClient();
      expect(client.ordersCreated).toBeDefined();
    }).pipe(Effect.provide(TestBroker))
  );

  it.effect("creates consumer resources", () =>
    Effect.gen(function* () {
      const client = yield* createTestClient();
      expect(client.billing).toBeDefined();
      expect(client.analytics).toBeDefined();
    }).pipe(Effect.provide(TestBroker))
  );

  it.effect("publish reaches consumer", () =>
    Effect.gen(function* () {
      let received: Order | undefined;

      const client = yield* createHandledClient();

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
    }).pipe(Effect.provide(TestBroker))
  );

  it.effect("supports multiple consumers", () =>
    Effect.gen(function* () {
      let analyticsHandled = false;
      let billingHandled = false;
      const client = yield* createHandledClient();

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
    }).pipe(Effect.provide(TestBroker))
  );

  it.effect("supports multiple handlers", () =>
    Effect.gen(function* () {
      let output = 0;
      const client = yield* createHandledClient();

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
    }).pipe(Effect.provide(TestBroker))
  );

  it.effect("awaitIdle waits for a running handler", () =>
    Effect.gen(function* () {
      const client = yield* createHandledClient();
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

      const delivery = yield* Effect.forkChild(
        client.ordersCreated.publish({
          orderId: "123"
        })
      );

      yield* Deferred.await(started);

      let idle = false;
      const idleFiber = yield* Effect.forkChild(
        broker.awaitIdle.pipe(
          Effect.tap(() =>
            Effect.sync(() => {
              idle = true;
            })
          )
        )
      );
      yield* Effect.yieldNow;
      expect(idle).toBe(false);

      yield* Deferred.succeed(release, undefined);
      yield* Fiber.join(delivery);
      yield* Fiber.join(idleFiber);
      expect(idle).toBe(true);
    }).pipe(Effect.provide(TestBroker))
  );

  it.effect("stops the broker and removes signal listeners after SIGINT", () =>
    Effect.gen(function* () {
      const client = yield* createHandledClient();
      let received = false;

      yield* client.analytics.handle(() =>
        Effect.sync(() => {
          received = true;
        })
      );

      const sigintListeners = process.listenerCount("SIGINT");
      const sigtermListeners = process.listenerCount("SIGTERM");

      const listening = yield* Effect.forkChild(client.listen());
      yield* Effect.yieldNow;

      expect(process.listenerCount("SIGINT")).toBe(sigintListeners + 1);
      expect(process.listenerCount("SIGTERM")).toBe(sigtermListeners + 1);

      yield* Effect.sync(() => {
        process.emit("SIGINT");
      });

      yield* Fiber.join(listening);

      expect(process.listenerCount("SIGINT")).toBe(sigintListeners);
      expect(process.listenerCount("SIGTERM")).toBe(sigtermListeners);

      yield* client.ordersCreated.publish({
        orderId: "123"
      });

      expect(received).toBe(false);
    }).pipe(Effect.provide(TestBroker))
  );

  it.effect("stops the broker and removes signal listeners after SIGTERM", () =>
    Effect.gen(function* () {
      const client = yield* createHandledClient();

      const sigintListeners = process.listenerCount("SIGINT");
      const sigtermListeners = process.listenerCount("SIGTERM");

      const listening = yield* Effect.forkChild(client.listen());
      yield* Effect.yieldNow;

      yield* Effect.sync(() => {
        process.emit("SIGTERM");
      });

      yield* Fiber.join(listening);

      expect(process.listenerCount("SIGINT")).toBe(sigintListeners);
      expect(process.listenerCount("SIGTERM")).toBe(sigtermListeners);
    }).pipe(Effect.provide(TestBroker))
  );

  const waitUntil = (condition: Effect.Effect<boolean>) =>
    Effect.gen(function* () {
      while (!(yield* condition)) {
        yield* Effect.yieldNow;
      }
    });

  it.effect("closes after the grace period when a handler is still running", () =>
    Effect.gen(function* () {
      const client = yield* createHandledClient();
      const broker = yield* Broker.Broker;

      const started = yield* Deferred.make<void>();
      const release = yield* Deferred.make<void>();

      yield* client.analytics.handle(() =>
        Effect.gen(function* () {
          yield* Deferred.succeed(started, undefined);
          yield* Deferred.await(release);
        })
      );

      const sigintListeners = process.listenerCount("SIGINT");

      const listening = yield* Effect.forkChild(
        client.listen({
          gracePeriod: "1 second"
        })
      );

      yield* waitUntil(Effect.sync(() => process.listenerCount("SIGINT") > sigintListeners));

      const delivery = yield* Effect.forkChild(
        client.ordersCreated.publish({
          orderId: "123"
        })
      );

      yield* Deferred.await(started);

      yield* Effect.sync(() => {
        process.emit("SIGINT");
      });

      yield* Effect.race(
        Fiber.join(listening),
        TestClock.adjust("1 second").pipe(Effect.andThen(Effect.yieldNow), Effect.forever)
      );

      let idle = false;
      const idleFiber = yield* Effect.forkChild(
        broker.awaitIdle.pipe(
          Effect.tap(() =>
            Effect.sync(() => {
              idle = true;
            })
          )
        )
      );
      yield* Effect.yieldNow;
      expect(idle).toBe(false); // handler still running after listen() returned

      yield* Deferred.succeed(release, undefined);
      yield* Fiber.join(delivery);
      yield* Fiber.join(idleFiber);
      expect(idle).toBe(true);
    }).pipe(Effect.provide(TestBroker))
  );

  it.effect("a second signal forces shutdown without waiting for the grace period", () =>
    Effect.gen(function* () {
      const client = yield* createHandledClient();

      const started = yield* Deferred.make<void>();
      const release = yield* Deferred.make<void>();

      yield* client.analytics.handle(() =>
        Effect.gen(function* () {
          yield* Deferred.succeed(started, undefined);
          yield* Deferred.await(release);
        })
      );

      const sigintListeners = process.listenerCount("SIGINT");
      const listening = yield* Effect.forkChild(client.listen({ gracePeriod: "30 seconds" }));
      yield* waitUntil(Effect.sync(() => process.listenerCount("SIGINT") > sigintListeners));

      const delivery = yield* Effect.forkChild(client.ordersCreated.publish({ orderId: "123" }));
      yield* Deferred.await(started);

      yield* Effect.sync(() => process.emit("SIGINT"));
      // The second-stage listener is registered once the first signal has been handled.
      yield* waitUntil(Effect.sync(() => process.listenerCount("SIGINT") > sigintListeners));
      yield* Effect.sync(() => process.emit("SIGINT"));

      yield* Fiber.join(listening); // resolves without advancing TestClock

      expect(process.listenerCount("SIGINT")).toBe(sigintListeners);

      yield* Deferred.succeed(release, undefined);
      yield* Fiber.join(delivery);
    }).pipe(Effect.provide(TestBroker))
  );

  it.effect("removes signal listeners when listen is interrupted", () =>
    Effect.gen(function* () {
      const client = yield* createHandledClient();

      const sigintListeners = process.listenerCount("SIGINT");
      const sigtermListeners = process.listenerCount("SIGTERM");

      const listening = yield* Effect.forkChild(client.listen());
      yield* Effect.yieldNow;

      expect(process.listenerCount("SIGINT")).toBe(sigintListeners + 1);
      expect(process.listenerCount("SIGTERM")).toBe(sigtermListeners + 1);

      yield* Fiber.interrupt(listening);

      expect(process.listenerCount("SIGINT")).toBe(sigintListeners);
      expect(process.listenerCount("SIGTERM")).toBe(sigtermListeners);
    }).pipe(Effect.provide(TestBroker))
  );

  it.effect("a second signal forces shutdown even when stop hangs", () =>
    Effect.gen(function* () {
      const client = yield* createHandledClient();
      const sigintListeners = process.listenerCount("SIGINT");

      const listening = yield* Effect.forkChild(client.listen());
      yield* waitUntil(Effect.sync(() => process.listenerCount("SIGINT") > sigintListeners));

      yield* Effect.sync(() => process.emit("SIGINT"));
      yield* waitUntil(Effect.sync(() => process.listenerCount("SIGINT") > sigintListeners));
      yield* Effect.sync(() => process.emit("SIGINT"));

      yield* Fiber.join(listening);
      expect(process.listenerCount("SIGINT")).toBe(sigintListeners);
    }).pipe(Effect.provide(HangingStopBroker))
  );

  it.effect("start fails when a consumer has no handler", () =>
    Effect.gen(function* () {
      const client = yield* createTestClient();

      yield* client.analytics.handle(() => Effect.void); // billing has none

      const exit = yield* Effect.exit(client.start());
      expect(Exit.isFailure(exit)).toBe(true);
    }).pipe(Effect.provide(TestBroker))
  );
});
