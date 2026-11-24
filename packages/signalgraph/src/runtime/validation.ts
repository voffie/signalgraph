import { Effect } from "effect";

import type { HandlerRegistry } from "../broker/index.ts";
import type { MessageGraph } from "./client.ts";
import { ValidationError } from "./errors.ts";

export function validateConsumers(graph: MessageGraph) {
  return Effect.gen(function* () {
    for (const definition of Object.values(graph)) {
      for (const consumer of definition.consumers) {
        if (consumer.prefetch !== undefined && (!Number.isInteger(consumer.prefetch) || consumer.prefetch < 0)) {
          return yield* new ValidationError({
            message: `Invalid prefetch value for consumer "${consumer.name}"`,
            area: "consumer"
          });
        }
      }
    }
  });
}

export function validateHandlers(graph: MessageGraph, handlers: HandlerRegistry) {
  return Effect.gen(function* () {
    const missing: Array<string> = [];

    for (const definition of Object.values(graph)) {
      for (const consumer of definition.consumers) {
        if (!handlers.has(consumer.name)) {
          missing.push(consumer.name);
        }
      }
    }

    if (missing.length > 0) {
      return yield* new ValidationError({
        message: `Consumer without a handler: ${missing.join(", ")}`,
        area: "consumer"
      });
    }
  });
}
