import { Effect, Random } from "effect";
import type { SpanContext } from "@opentelemetry/api";
import { CurrentMessageMetadata } from "./references.ts";
import { currentOtelSpan } from "@effect/opentelemetry/OtelTracer";

export interface MessageMetadata {
  readonly messageId: string;
  readonly correlationId: string;
  readonly traceContext?: SpanContext;
};

function generateMessageId() {
  return Effect.gen(function* () {
    const ts = Date.now().toString(36);

    const a = Math.abs(yield* Random.nextInt).toString(36);
    const b = Math.abs(yield* Random.nextInt).toString(36);

    return `${ts}-${a}-${b}`;
  });
}

export function createPublishMetadata() {
  return Effect.gen(function* () {
    const parent = yield* CurrentMessageMetadata;
    const span = yield* currentOtelSpan;

    const messageId = yield* generateMessageId();
    const correlationId = parent?.correlationId ?? messageId;

    return {
      messageId,
      correlationId,
      traceContext: span.spanContext()
    };
  });
}

export function createConsumeMetadata(args: {
  messageId: string;
  correlationId: string;
  traceContext?: SpanContext;
}): MessageMetadata {
  return {
    messageId: args.messageId,
    correlationId: args.correlationId,
    ...(args.traceContext && {
      traceContext: args.traceContext
    })
  };
}
