import { Effect } from "effect";

import type { MessageGraph } from "./client.ts";
import { ValidationError } from "./errors.ts";

export function validateRuntime(graph: MessageGraph) {
  return Effect.gen(function* () {
    for (const [name, message] of Object.entries(graph)) {
      if (message.consumers.length === 0) {
        return yield* new ValidationError({
          message: `Message "${name}" has no consumers`,
          area: "graph",
        });
      }
    }
  });
}

export function validateConsumers(graph: MessageGraph) {
  return Effect.gen(function* () {
    for (const definition of Object.values(graph)) {
      for (const consumer of definition.consumers) {
        if (
          consumer.prefetch !== undefined &&
          (!Number.isInteger(consumer.prefetch) || consumer.prefetch < 0)
        ) {
          return yield* new ValidationError({
            message: `Invalid prefetch value for consumer "${consumer.name}"`,
            area: "consumer",
          });
        }
      }
    }
  });
}
