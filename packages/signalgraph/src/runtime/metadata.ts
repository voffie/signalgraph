import { currentOtelSpan } from "@effect/opentelemetry/OtelTracer";
import type { SpanContext } from "@opentelemetry/api";
import { Effect, Option, Random } from "effect";

import { CurrentMessageMetadata } from "./references.ts";

/** Identifies a delivery and the correlation ID it shares with related messages. */
export interface MessageMetadata {
  readonly messageId: string;
  readonly correlationId: string;
  readonly retryAttempt: number;
  readonly traceContext: Option.Option<SpanContext>;
}

function generateMessageId() {
  return Effect.gen(function* () {
    const ts = Date.now().toString(36);

    const a = Math.abs(yield* Random.nextInt).toString(36);
    const b = Math.abs(yield* Random.nextInt).toString(36);

    return `${ts}-${a}-${b}`;
  });
}

/** Creates metadata for an outgoing message. Reuses the correlation ID of the current delivery. */
export function createPublishMetadata(): Effect.Effect<MessageMetadata> {
  return Effect.gen(function* () {
    const parent = yield* CurrentMessageMetadata;

    const traceContext = yield* currentOtelSpan.pipe(
      Effect.map((span) => Option.some(span.spanContext())),
      Effect.catchTag("NoSuchElementError", () => Effect.succeed(Option.none()))
    );

    const messageId = yield* generateMessageId();

    const correlationId = Option.getOrElse(
      Option.map(parent, (metadata) => metadata.correlationId),
      () => messageId
    );

    return {
      messageId,
      correlationId,
      retryAttempt: 1,
      traceContext
    };
  });
}
