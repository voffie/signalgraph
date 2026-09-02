import type { SpanKind, SpanStatusCode } from "@opentelemetry/api";

export interface SignalGraphSpan {
  readonly traceId: string;
  readonly spanId: string;
  readonly parentSpanId: string;

  readonly name: string;
  readonly kind: SpanKind;

  readonly startTime: number;
  readonly endTime: number;
  readonly duration: number;

  readonly attributes: Record<string, unknown>;

  readonly status: {
    readonly code: SpanStatusCode;
    readonly message: string;
  };
}
