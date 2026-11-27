import * as Cloudflare from "@alchemy.run/cloudflare";
import { expect, it } from "@effect/vitest";
import { declareCloudflareQueues } from "@signalgraph/adapter-cloudflare/alchemy";
import * as Alchemy from "alchemy";
import * as Output from "alchemy/Output";
import * as Provider from "alchemy/Provider";
import { Effect, Layer, Schema } from "effect";
import { consumer, message } from "signalgraph";

const OrderCreated = message({ name: "order.created", schema: Schema.Struct({ orderId: Schema.Number }) });
const Analytics = consumer({ name: "analytics", message: OrderCreated });

const Billing = consumer({
  name: "billing",
  message: OrderCreated,
  dlq: false,
  retry: { type: "fixed", maxAttempts: 4, delay: "2 seconds" }
});

it.effect("maps each consumer's retry and dead-letter policy to its own queue and Worker bindings", () =>
  Effect.gen(function* () {
    const state = Alchemy.inMemoryState();

    const stack = yield* Alchemy.Stack(
      "Orders",
      {
        // Register resource declarations without installing any deployment providers.
        providers: Layer.effect(Cloudflare.Providers, Provider.collection([])),
        state
      },
      Effect.gen(function* () {
        const queues = yield* declareCloudflareQueues({
          "order.created": { definition: OrderCreated, consumers: [Analytics, Billing] }
        }).pipe(Effect.orDie);

        const worker = yield* Cloudflare.Worker("App", {
          main: "./worker.ts",
          env: queues.workerBindings
        });

        yield* queues.attachConsumers(worker);

        return queues.workerBindings;
      })
    ).pipe(Effect.provideService(Alchemy.Stage, "test"));

    const deployedValues = {
      App: { workerName: "deployed-orders" },
      "signalgraph-queue-analytics": { queueId: "queue-a", queueName: "deployed-analytics" },
      "signalgraph-queue-billing": { queueId: "queue-b", queueName: "deployed-billing" },
      "signalgraph-dlq-analytics": { queueId: "queue-dlq", queueName: "deployed-analytics-dlq" }
    };

    const { resources } = stack;

    const { bindings, analytics, billing } = yield* Effect.all({
      bindings: Output.evaluate(stack.output, deployedValues),
      analytics: Output.evaluate(resources["signalgraph-consumer-analytics"]?.Props, deployedValues),
      billing: Output.evaluate(resources["signalgraph-consumer-billing"]?.Props, deployedValues)
    }).pipe(Effect.provide(state));

    expect(bindings).toEqual({
      SIGNALGRAPH_QUEUE_ANALYTICS: deployedValues["signalgraph-queue-analytics"],
      SIGNALGRAPH_QUEUE_NAME_ANALYTICS: "deployed-analytics",
      SIGNALGRAPH_QUEUE_BILLING: deployedValues["signalgraph-queue-billing"],
      SIGNALGRAPH_QUEUE_NAME_BILLING: "deployed-billing"
    });
    expect(analytics).toEqual({
      queueId: "queue-a",
      scriptName: "deployed-orders",
      settings: { maxRetries: 0 },
      deadLetterQueue: "deployed-analytics-dlq"
    });
    expect(billing).toEqual({
      queueId: "queue-b",
      scriptName: "deployed-orders",
      settings: { maxRetries: 3 }
    });
    expect(resources["signalgraph-dlq-analytics"]).toBeDefined();
    expect(resources["signalgraph-dlq-billing"]).toBeUndefined();
  })
);
