import { describe, expect, it } from "@effect/vitest";
import { Effect, Schema } from "effect";
import { consumer, message, type AnyConsumer, type RetryPolicy } from "signalgraph";
import type { MessageGraph } from "signalgraph/runtime";

import { deriveCloudflareQueueTopology } from "../src/topology.js";

const OrderCreated = message({ name: "order.created", schema: Schema.Struct({ orderId: Schema.Number }) });

const orderGraph = (...consumers: ReadonlyArray<AnyConsumer>): MessageGraph => ({
  "order.created": { definition: OrderCreated, consumers }
});

describe("Cloudflare queue topology", () => {
  it.effect("derives both Worker binding names and the fixed retry delays", () =>
    Effect.gen(function* () {
      const analytics = consumer({ name: "order-analytics", message: OrderCreated });

      const billing = consumer({
        name: "billing",
        message: OrderCreated,
        retry: { type: "fixed", maxAttempts: 3, delay: "1250 millis" }
      });

      const topology = yield* deriveCloudflareQueueTopology(orderGraph(analytics, billing));

      expect(topology).toEqual([
        {
          consumer: analytics,
          binding: "SIGNALGRAPH_QUEUE_ORDER_ANALYTICS",
          nameBinding: "SIGNALGRAPH_QUEUE_NAME_ORDER_ANALYTICS",
          retryDelays: []
        },
        {
          consumer: billing,
          binding: "SIGNALGRAPH_QUEUE_BILLING",
          nameBinding: "SIGNALGRAPH_QUEUE_NAME_BILLING",
          retryDelays: [2, 2]
        }
      ]);
    })
  );

  const collidingNames = [
    ["order-analytics", "order_analytics", "SIGNALGRAPH_QUEUE_ORDER_ANALYTICS"],
    ["billing", "name-billing", "SIGNALGRAPH_QUEUE_NAME_BILLING"],
    ["name-billing", "billing", "SIGNALGRAPH_QUEUE_NAME_BILLING"]
  ] as const;

  for (const [first, second, binding] of collidingNames) {
    it.effect(`rejects the binding collision between ${first} and ${second}`, () =>
      Effect.gen(function* () {
        const graph = orderGraph(
          consumer({ name: first, message: OrderCreated }),
          consumer({ name: second, message: OrderCreated })
        );

        const error = yield* Effect.flip(deriveCloudflareQueueTopology(graph));

        expect(error._tag).toBe("InitializationError");
        expect(error.cause).toMatchObject({ field: "name", consumer: second, binding });
      })
    );
  }

  it.effect("rejects broker prefetch configuration that the Cloudflare adapter cannot apply", () =>
    Effect.gen(function* () {
      const billing = consumer({ name: "billing", message: OrderCreated, prefetch: 1 });
      const error = yield* Effect.flip(deriveCloudflareQueueTopology(orderGraph(billing)));

      expect(error._tag).toBe("InitializationError");
      expect(error.cause).toMatchObject({ field: "prefetch", consumer: "billing" });
    })
  );

  it.effect("allows 100 retries with a delay of exactly 24 hours", () =>
    Effect.gen(function* () {
      const billing = consumer({
        name: "billing",
        message: OrderCreated,
        retry: { type: "fixed", maxAttempts: 101, delay: "24 hours" }
      });

      const topology = yield* deriveCloudflareQueueTopology(orderGraph(billing));

      expect(topology[0]?.retryDelays).toEqual(Array<number>(100).fill(86_400));
    })
  );

  const unsupportedPolicies: ReadonlyArray<{ retry: RetryPolicy; field: string }> = [
    { retry: { type: "fixed", maxAttempts: 102, delay: "1 second" }, field: "retry.maxAttempts" },
    { retry: { type: "fixed", maxAttempts: 2, delay: "86400001 millis" }, field: "retry.delay" },
    { retry: { type: "exponential", maxAttempts: 3, initialDelay: "13 hours" }, field: "retry.delay" }
  ];

  for (const { retry, field } of unsupportedPolicies) {
    it.effect(`rejects ${retry.type} retries that exceed the Cloudflare limit for ${field}`, () =>
      Effect.gen(function* () {
        const billing = consumer({ name: "billing", message: OrderCreated, retry });
        const error = yield* Effect.flip(deriveCloudflareQueueTopology(orderGraph(billing)));

        expect(error._tag).toBe("InitializationError");
        expect(error.cause).toMatchObject({ field, consumer: "billing" });
      })
    );
  }
});
