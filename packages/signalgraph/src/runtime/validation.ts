import { Duration, Effect, Option } from "effect";

import type { HandlerRegistry } from "../broker/index.ts";
import type { MessageGraph } from "./client.ts";
import { ValidationError } from "./errors.ts";

/** Checks static topology before a client can register handlers or start consuming. */
export function validateConsumers(graph: MessageGraph) {
  return Effect.gen(function* () {
    for (const definition of Object.values(graph)) {
      for (const consumer of definition.consumers) {
        const retry = consumer.retry;

        const invalidField =
          consumer.prefetch !== undefined && (!Number.isInteger(consumer.prefetch) || consumer.prefetch < 0)
            ? "prefetch (expected a nonnegative integer)"
            : retry !== undefined && (!Number.isSafeInteger(retry.maxAttempts) || retry.maxAttempts < 1)
              ? "retry.maxAttempts (expected a positive safe integer)"
              : undefined;

        if (invalidField !== undefined) {
          return yield* new ValidationError({
            message: `Cannot create client for consumer "${consumer.name}". Correct ${invalidField}.`,
            area: "consumer"
          });
        }

        if (retry === undefined) continue;

        const delays =
          retry.type === "fixed" ? [retry.delay] : [retry.initialDelay, retry.maxDelay ?? retry.initialDelay];

        for (const delay of delays) {
          if (!Option.exists(Duration.fromInput(delay), Duration.isFinite)) {
            return yield* new ValidationError({
              message: `Cannot create client for consumer "${consumer.name}". Set retry delays to finite durations.`,
              area: "consumer"
            });
          }
        }

        if (
          retry.type === "exponential" &&
          retry.factor !== undefined &&
          (!Number.isFinite(retry.factor) || retry.factor < 1)
        ) {
          return yield* new ValidationError({
            message: `Cannot create client for consumer "${consumer.name}". Set retry.factor to a finite number of at least 1.`,
            area: "consumer"
          });
        }
      }
    }
  });
}

/** Checks registered handlers immediately before handing the topology to the broker. */
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
        message: `Cannot start consumers without handlers: ${missing.join(", ")}. Register a handler for each consumer before starting.`,
        area: "consumer"
      });
    }
  });
}
