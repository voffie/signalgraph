import { describe, expect, it } from "@effect/vitest";
import { Deferred, Effect, Fiber, Schema } from "effect";
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
    }).pipe(Effect.provide(TestBroker))
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
    }).pipe(Effect.provide(TestBroker))
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
    }).pipe(Effect.provide(TestBroker))
  );

  it.effect("ignores consumers without handlers", () =>
    Effect.gen(function* () {
      const client = yield* createTestClient();

      yield* client.ordersCreated.publish({ orderId: "123" });
    }).pipe(Effect.provide(TestBroker))
  );

  it.effect("tracks active handler dispatches and waits until they finish", () =>
    Effect.gen(function* () {
      const client = yield* createTestClient();
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

      expect((yield* broker.status).activeHandlers).toBe(1);

      const idle = yield* Effect.forkChild(broker.awaitIdle);

      yield* Deferred.succeed(release, undefined);
      yield* Fiber.join(delivery);
      yield* Fiber.join(idle);

      expect((yield* broker.status).activeHandlers).toBe(0);
    }).pipe(Effect.provide(TestBroker))
  );

  it.effect("stops the broker and removes signal listeners after SIGINT", () =>
    Effect.gen(function* () {
      const client = yield* createTestClient();
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
      const client = yield* createTestClient();

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
      const client = yield* createTestClient();
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

      expect((yield* broker.status).activeHandlers).toBe(1);

      yield* Deferred.succeed(release, undefined);
      yield* Fiber.join(delivery);
      expect((yield* broker.status).activeHandlers).toBe(0);
    }).pipe(Effect.provide(TestBroker))
  );

  it.effect("removes signal listeners when listen is interrupted", () =>
    Effect.gen(function* () {
      const client = yield* createTestClient();

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
});
