import { currentOtelSpan } from "@effect/opentelemetry/OtelTracer";
import type { SpanContext } from "@opentelemetry/api";
import { Effect, Random } from "effect";

import { CurrentMessageMetadata } from "./references.ts";

export interface MessageMetadata {
  readonly messageId: string;
  readonly correlationId: string;
  readonly retryAttempt: number;
  readonly traceContext?: SpanContext;
}

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
      retryAttempt: 1,
      traceContext: span.spanContext()
    };
  });
}

export function createConsumeMetadata(args: {
  messageId: string;
  correlationId: string;
  retryAttempt: number;
  traceContext?: SpanContext;
}): MessageMetadata {
  return {
    messageId: args.messageId,
    correlationId: args.correlationId,
    retryAttempt: args.retryAttempt,
    ...(args.traceContext && {
      traceContext: args.traceContext
    })
  };
}
