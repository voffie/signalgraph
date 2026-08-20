import type { Attribute, Trace, TraceSpan } from "$lib/domain/types";
import type { TempoAttribute, TempoAttributeValue, TempoSpan, TempoResponse } from "./types.ts";

function normalizeAttributeValue(value: TempoAttributeValue): string {
  if (value.stringValue !== undefined) {
    return value.stringValue;
  }

  if (value.boolValue !== undefined) {
    return String(value.boolValue);
  }

  if (value.intValue !== undefined) {
    return value.intValue;
  }

  if (value.doubleValue !== undefined) {
    return String(value.doubleValue);
  }

  if (value.bytesValue !== undefined) {
    return value.bytesValue;
  }

  if (value.arrayValue !== undefined) {
    return JSON.stringify(value.arrayValue.values);
  }

  if (value.kvlistValue !== undefined) {
    return JSON.stringify(value.kvlistValue.values);
  }

  throw new Error("Tempo attribute has no supported value");
}

function normalizeAttribute(attribute: TempoAttribute): Attribute {
  return {
    key: attribute.key,
    value: normalizeAttributeValue(attribute.value)
  };
}

function normalizeTimestamp(timestamp: string): number {
  const value = Number(timestamp);

  if (!Number.isFinite(value)) {
    throw new Error(`Invalid Tempo timestamp: ${timestamp}`);
  }

  return value / 1_000_000;
}

function normalizeSpan(span: TempoSpan): TraceSpan {
  return {
    spanId: span.spanId,
    traceId: span.traceId,
    parentSpanId: span.parentSpanId,
    name: span.name,
    startTime: normalizeTimestamp(span.startTimeUnixNano),
    endTime: normalizeTimestamp(span.endTimeUnixNano),
    attributes: span.attributes.map(normalizeAttribute),
  };
}

export function normalizeTrace(response: TempoResponse): Trace {
  const spans: Array<TraceSpan> = [];
  const resourceAttributes: Array<Attribute> = [];

  for (const resourceSpan of response.trace.resourceSpans) {
    resourceAttributes.push(
      ...resourceSpan.resource.attributes.map(normalizeAttribute)
    );

    for (const scopeSpan of resourceSpan.scopeSpans) {
      for (const span of scopeSpan.spans) {
        spans.push(normalizeSpan(span));
      }
    }
  }

  if (spans.length === 0) {
    throw new Error("Tempo trace contains no spans");
  }

  const traceId = spans[0].traceId;

  if (spans.some((span) => span.traceId !== traceId)) {
    throw new Error("Tempo response contains multiple trace IDs");
  }

  return {
    traceId,
    spans,
    resourceAttributes
  };
}
