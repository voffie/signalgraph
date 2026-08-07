import type { ReadableSpan, SpanExporter } from "@opentelemetry/sdk-trace-base";
import type { SignalGraphSpan } from "./model.ts";

function toSignalGraphSpan(span: ReadableSpan): SignalGraphSpan {
  const startTime =
    span.startTime[0] * 1000 +
    span.startTime[1] / 1_000_000;

  const endTime =
    span.endTime[0] * 1000 +
    span.endTime[1] / 1_000_000;

  return {
    traceId: span.spanContext().traceId,
    spanId: span.spanContext().spanId,
    parentSpanId: span.parentSpanContext?.spanId ?? "",

    name: span.name,
    kind: span.kind,

    startTime,
    endTime,
    duration: endTime - startTime,

    attributes: span.attributes,

    status: {
      code: span.status.code,
      message: span.status.message ?? ""
    }
  };
}

export class SignalGraphExporter implements SpanExporter {
  export(
    spans: Array<ReadableSpan>,
    resultCallback: Parameters<SpanExporter["export"]>[1]
  ) {
    const signalGraphSpans = spans.map(toSignalGraphSpan);

    console.log(signalGraphSpans);

    resultCallback({
      code: 0
    });
  }

  shutdown() {
    return Promise.resolve();
  }

  forceFlush() {
    return Promise.resolve();
  }
}
