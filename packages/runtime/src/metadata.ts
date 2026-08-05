import type { SpanContext } from "@opentelemetry/api";

export interface MessageMetadata {
  readonly messageId: string;
  readonly correlationId: string;
  readonly traceContext?: SpanContext;
};
