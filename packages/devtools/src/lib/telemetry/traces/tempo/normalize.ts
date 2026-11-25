import type { Attribute, Trace, TraceSpan, TraceSummary } from "#lib/domain/types.js";

import type { TempoAttribute, TempoAttributeValue, TempoSpan, TempoResponse, TempoSearchResponse } from "./types.js";

function base64ToHex(base64: string): string {
  return Buffer.from(base64, "base64").toString("hex");
}

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
    spanId: base64ToHex(span.spanId),
    traceId: base64ToHex(span.traceId),
    parentSpanId: span.parentSpanId ? base64ToHex(span.parentSpanId) : undefined,
    name: span.name,
    startTime: normalizeTimestamp(span.startTimeUnixNano),
    endTime: normalizeTimestamp(span.endTimeUnixNano),
    attributes: (span.attributes ?? []).map(normalizeAttribute)
  };
}

/** Converts an OTLP trace into SignalGraph's graph inputs, rejecting mixed trace IDs. */
export function normalizeTrace(response: typeof TempoResponse.Type): Trace {
  const spans: Array<TraceSpan> = [];
  const resourceAttributes: Array<Attribute> = [];

  for (const resourceSpan of response.trace.resourceSpans) {
    resourceAttributes.push(...(resourceSpan.resource?.attributes ?? []).map(normalizeAttribute));

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

/** Converts Tempo search results to SignalGraph summaries with millisecond timestamps. */
export function normalizeSearchResponse(response: typeof TempoSearchResponse.Type): Array<TraceSummary> {
  return (response.traces ?? []).map((result) => ({
    traceId: result.traceID,
    rootService: result.rootServiceName,
    rootOperation: result.rootTraceName,
    durationMs: result.durationMs,
    startTime: normalizeTimestamp(result.startTimeUnixNano)
  }));
}
