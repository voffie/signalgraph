import { Effect } from "effect";
import type { MessageGraph } from "./client.ts";
import { ValidationError } from "./errors.ts";

export function validateRuntime(graph: MessageGraph) {
  return Effect.gen(function* () {
    for (const [name, message] of Object.entries(graph)) {
      if (message.consumers.length === 0) {
        yield* new ValidationError({
          message: `Message "${name}" has no consumers`,
          area: "graph"
        });
      }
    }
  });
}
