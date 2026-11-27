/// <reference types="@cloudflare/workers-types" />

import * as Cloudflare from "@alchemy.run/cloudflare";
import { declareCloudflareQueues, type DeclaredCloudflareQueues } from "@signalgraph/adapter-cloudflare/alchemy";
import * as Alchemy from "alchemy";
import { Effect } from "effect";

import { messageGraph } from "./generated/index.ts";

const ordersWorker = (queues: DeclaredCloudflareQueues) =>
  Cloudflare.Worker("Orders", {
    main: "./src/worker.ts",
    env: { ...queues.workerBindings }
  });

/** Runtime binding types inferred from the application's own Worker declaration. */
export type WorkerEnv = Cloudflare.InferEnv<ReturnType<typeof ordersWorker>>;

/** Deploys the example application's Worker and its SignalGraph queues. */
export default Alchemy.Stack(
  "SignalGraphCloudflareExample",
  { providers: Cloudflare.providers(), state: Alchemy.localState() },
  Effect.gen(function* () {
    // Alchemy reserves the stack's typed failure channel for configuration errors.
    const queues = yield* declareCloudflareQueues(messageGraph).pipe(Effect.orDie);

    const worker = yield* ordersWorker(queues);

    yield* queues.attachConsumers(worker);

    return { url: worker.url };
  })
);
