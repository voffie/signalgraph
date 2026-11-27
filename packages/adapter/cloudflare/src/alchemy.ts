import { type Providers, Queues, type Workers } from "@alchemy.run/cloudflare";
import { Effect, Option } from "effect";
import type { InitializationError, MessageGraph } from "signalgraph/runtime";

import { deriveCloudflareQueueTopology, type CloudflareQueueBindingName } from "./topology.ts";

type WorkerQueueBindings = {
  [binding: CloudflareQueueBindingName]: Queues.Queue | Queues.Queue["queueName"];
};

/** Deployment resources that an application composes with its own Worker. */
export interface DeclaredCloudflareQueues {
  /** Add these bindings to the Worker's Alchemy env. */
  readonly workerBindings: Readonly<WorkerQueueBindings>;
  /** Attaches each discovered consumer's queue to the application's Worker. */
  readonly attachConsumers: (worker: Workers.Worker) => Effect.Effect<void, never, Providers>;
}

/** Declares queues and bindings from the generated message graph in the application's Alchemy stack. */
export const declareCloudflareQueues: (
  graph: MessageGraph
) => Effect.Effect<DeclaredCloudflareQueues, InitializationError, Providers> = Effect.fn(function* (
  graph: MessageGraph
) {
  const topology = yield* deriveCloudflareQueueTopology(graph);

  const resources = yield* Effect.forEach(topology, (entry) =>
    Effect.gen(function* () {
      const queue = yield* Queues.Queue(`signalgraph-queue-${entry.consumer.name}`);

      const deadLetters =
        entry.consumer.dlq === true
          ? Option.some(yield* Queues.Queue(`signalgraph-dlq-${entry.consumer.name}`))
          : Option.none();

      return { entry, queue, deadLetters };
    })
  );

  const workerBindings: WorkerQueueBindings = {};

  for (const { entry, queue } of resources) {
    workerBindings[entry.binding] = queue;
    workerBindings[entry.nameBinding] = queue.queueName;
  }

  return {
    workerBindings,
    attachConsumers: (worker: Workers.Worker) =>
      Effect.forEach(
        resources,
        ({ entry, queue, deadLetters }) =>
          Queues.Consumer(`signalgraph-consumer-${entry.consumer.name}`, {
            queueId: queue.queueId,
            scriptName: worker.workerName,
            settings: { maxRetries: entry.retryDelays.length },
            ...(Option.isSome(deadLetters) && { deadLetterQueue: deadLetters.value.queueName })
          }),
        { discard: true }
      )
  };
});
