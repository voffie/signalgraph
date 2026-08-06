import { Effect } from "effect";
import type { SpanContext } from "@opentelemetry/api";
import { CurrentMessageMetadata } from "./references.ts";
import { currentOtelSpan } from "@effect/opentelemetry/OtelTracer";

export interface MessageMetadata {
  readonly messageId: string;
  readonly correlationId: string;
  readonly traceContext?: SpanContext;
};

export function createPublishMetadata() {
  return Effect.gen(function* () {
    const parent = yield* CurrentMessageMetadata;
    const span = yield* currentOtelSpan;

    const messageId = "temp";
    const correlationId = parent?.correlationId ?? messageId;

    return {
      messageId,
      correlationId,
      traceContext: span.spanContext()
    };
  });
}
