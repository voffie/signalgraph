import type { MessageBatch } from "@cloudflare/workers-types";
import { cloudflareBatchBrokerLayer, cloudflareBrokerLayer } from "@signalgraph/adapter-cloudflare";
import { Effect } from "effect";

import type { WorkerEnv } from "../alchemy.run.ts";
import { Client, messageGraph } from "../generated/index.ts";

/** Publishes a demonstration order and dispatches the resulting queue deliveries. */
export default {
  async fetch(request: Request, env: WorkerEnv) {
    if (request.method !== "POST" || new URL(request.url).pathname !== "/orders") {
      return new Response("Send POST /orders to publish an example order.", { status: 404 });
    }

    await Effect.runPromise(
      Effect.gen(function* () {
        const client = yield* Client;
        yield* client.orderCreated.publish({ orderId: 1 });
      }).pipe(Effect.provide(cloudflareBrokerLayer(messageGraph, env)))
    );

    return new Response("Order queued.", { status: 202 });
  },

  queue(batch: MessageBatch, env: WorkerEnv) {
    return Effect.runPromise(
      Effect.gen(function* () {
        const client = yield* Client;
        yield* client.analytics.handle(({ payload }) => Effect.logInfo("Analytics received an order", payload.orderId));
        yield* client.billing.handle(({ payload }) => Effect.logInfo("Billing received an order", payload.orderId));
        yield* client.start();
      }).pipe(Effect.provide(cloudflareBatchBrokerLayer(messageGraph, env, batch)))
    );
  }
};
