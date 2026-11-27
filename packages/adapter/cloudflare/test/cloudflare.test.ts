import type { Message, MessageBatch, Queue } from "@cloudflare/workers-types";
import { describe, expect, it, vi } from "@effect/vitest";
import { cloudflareBatchBrokerLayer, cloudflareBrokerLayer } from "@signalgraph/adapter-cloudflare";
import { Effect } from "effect";
import { Broker } from "signalgraph/broker";

import { Client, graph } from "./fixtures/client.ts";

const metadata = { metrics: { backlogCount: 0, backlogBytes: 0 } };

function makeQueue() {
  return {
    send: vi.fn<Queue<string>["send"]>().mockResolvedValue({ metadata }),
    sendBatch: vi.fn<Queue<string>["sendBatch"]>().mockResolvedValue({ metadata }),
    metrics: vi.fn<Queue<string>["metrics"]>().mockResolvedValue(metadata.metrics)
  } satisfies Queue<string>;
}

function makeBindings() {
  return {
    SIGNALGRAPH_QUEUE_ANALYTICS: makeQueue(),
    SIGNALGRAPH_QUEUE_NAME_ANALYTICS: "orders-analytics",
    SIGNALGRAPH_QUEUE_BILLING: makeQueue(),
    SIGNALGRAPH_QUEUE_NAME_BILLING: "orders-billing"
  };
}

function makeDelivery(id: string, body: string, attempts: number) {
  return {
    id,
    body,
    attempts,
    timestamp: new Date(0),
    ack: vi.fn<Message["ack"]>(),
    retry: vi.fn<Message["retry"]>()
  } satisfies Message<string>;
}

function makeBatch(queue: string, messages: ReadonlyArray<Message<string>>) {
  return {
    queue,
    messages,
    metadata,
    ackAll: vi.fn<MessageBatch["ackAll"]>(),
    retryAll: vi.fn<MessageBatch["retryAll"]>()
  } satisfies MessageBatch<string>;
}

describe("Cloudflare Queues adapter", () => {
  it.effect("fans out one envelope and reports delivery that a queue did not confirm", () =>
    Effect.gen(function* () {
      const env = makeBindings();
      env.SIGNALGRAPH_QUEUE_ANALYTICS.send.mockRejectedValueOnce(new Error("Queue send failed"));

      const error = yield* Effect.gen(function* () {
        const client = yield* Client;

        return yield* Effect.flip(client.orderCreated.publish({ orderId: 42 }));
      }).pipe(Effect.provide(cloudflareBrokerLayer(graph, env)));

      expect(error._tag).toBe("ConnectionError");
      expect(error.cause).toMatchObject({
        operation: "publish",
        message: "order.created",
        confirmed: ["orders-billing"],
        uncertain: [{ queue: "orders-analytics" }]
      });
      expect(env.SIGNALGRAPH_QUEUE_BILLING.send).toHaveBeenCalledExactlyOnceWith(expect.any(String), {
        contentType: "text"
      });
      expect(env.SIGNALGRAPH_QUEUE_ANALYTICS.send.mock.calls).toEqual(env.SIGNALGRAPH_QUEUE_BILLING.send.mock.calls);
    })
  );

  it.effect("dispatches a batch by physical queue name and settles each message independently", () =>
    Effect.gen(function* () {
      const env = makeBindings();

      yield* Effect.gen(function* () {
        const client = yield* Client;
        yield* client.orderCreated.publish({ orderId: 42 });
        yield* client.orderCreated.publish({ orderId: 43 });
      }).pipe(Effect.provide(cloudflareBrokerLayer(graph, env)));

      const sent = env.SIGNALGRAPH_QUEUE_BILLING.send.mock.calls;
      const [successful, failing] = sent;

      if (!successful || !failing) throw new Error("Expected two published queue messages.");

      const invalid = makeDelivery("invalid", "invalid envelope", 1);
      const initial = makeDelivery("initial", failing[0], 1);
      const second = makeDelivery("second", failing[0], 2);
      const exhausted = makeDelivery("exhausted", failing[0], 3);
      const delivered = makeDelivery("delivered", successful[0], 1);

      const batch = makeBatch(env.SIGNALGRAPH_QUEUE_NAME_BILLING, [invalid, initial, second, exhausted, delivered]);

      const analytics = vi.fn();
      const billing = vi.fn<(orderId: number, attempt: number) => void>();

      yield* Effect.gen(function* () {
        const client = yield* Client;
        yield* client.analytics.handle(() => Effect.sync(analytics));
        yield* client.billing.handle(({ payload, metadata }) =>
          Effect.gen(function* () {
            billing(payload.orderId, metadata.retryAttempt);

            if (payload.orderId === 43) return yield* Effect.die(new Error("Billing failed"));
          })
        );
        yield* client.start();
      }).pipe(Effect.provide(cloudflareBatchBrokerLayer(graph, env, batch)));

      expect(analytics).not.toHaveBeenCalled();
      expect(billing.mock.calls).toEqual([
        [43, 1],
        [43, 2],
        [43, 3],
        [42, 1]
      ]);
      expect(invalid.retry).toHaveBeenCalledExactlyOnceWith({ delaySeconds: 2 });
      expect(initial.retry).toHaveBeenCalledExactlyOnceWith({ delaySeconds: 2 });
      expect(second.retry).toHaveBeenCalledExactlyOnceWith({ delaySeconds: 3 });
      expect(exhausted.retry).toHaveBeenCalledExactlyOnceWith();

      for (const failed of [invalid, initial, second, exhausted]) expect(failed.ack).not.toHaveBeenCalled();
      expect(delivered.ack).toHaveBeenCalledExactlyOnceWith();
      expect(delivered.retry).not.toHaveBeenCalled();
      expect(batch.ackAll).not.toHaveBeenCalled();
      expect(batch.retryAll).not.toHaveBeenCalled();
    })
  );

  it.effect("rejects a batch whose physical queue name is missing from the Worker bindings", () =>
    Effect.gen(function* () {
      const batch = makeBatch("unbound-queue", []);

      const error = yield* Effect.gen(function* () {
        const broker = yield* Broker;

        return yield* Effect.flip(broker.start({ graph, handlers: new Map() }));
      }).pipe(Effect.provide(cloudflareBatchBrokerLayer(graph, makeBindings(), batch)));

      expect(error._tag).toBe("InitializationError");
      expect(error.cause).toMatchObject({ operation: "consumeBatch", reason: "UnknownQueue", queue: "unbound-queue" });
      expect(batch.ackAll).not.toHaveBeenCalled();
    })
  );

  it.effect("returns a pending batch once when stopped before consumption", () =>
    Effect.gen(function* () {
      const env = makeBindings();
      const delivery = makeDelivery("pending", "unread body", 1);
      const batch = makeBatch(env.SIGNALGRAPH_QUEUE_NAME_BILLING, [delivery]);

      yield* Effect.gen(function* () {
        const broker = yield* Broker;
        yield* broker.stop;
        yield* broker.start({ graph, handlers: new Map() });
        yield* broker.stop;
        yield* broker.close;
      }).pipe(Effect.provide(cloudflareBatchBrokerLayer(graph, env, batch)));

      expect(batch.retryAll).toHaveBeenCalledExactlyOnceWith();
      expect(batch.ackAll).not.toHaveBeenCalled();
      expect(delivery.ack).not.toHaveBeenCalled();
      expect(delivery.retry).not.toHaveBeenCalled();
    })
  );

  it.effect("rejects an incomplete Worker binding before publishing", () =>
    Effect.gen(function* () {
      const env = { ...makeBindings(), SIGNALGRAPH_QUEUE_NAME_BILLING: undefined };
      const error = yield* Client.pipe(Effect.provide(cloudflareBrokerLayer(graph, env)), Effect.flip);

      expect(error._tag).toBe("InitializationError");
      expect(error.cause).toMatchObject({ operation: "resolveQueueBindings", consumer: "billing" });
      expect(env.SIGNALGRAPH_QUEUE_ANALYTICS.send).not.toHaveBeenCalled();
      expect(env.SIGNALGRAPH_QUEUE_BILLING.send).not.toHaveBeenCalled();
    })
  );
});
