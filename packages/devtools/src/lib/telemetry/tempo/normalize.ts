import type { Attribute, Trace, TraceSpan, TraceSummary } from "$lib/domain/types";
import type { TempoAttribute, TempoAttributeValue, TempoSpan, TempoResponse, TempoSearchResponse } from "./types.ts";

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

export function normalizeSearchResponse(response: TempoSearchResponse): Array<TraceSummary> {
  return response.traces.map((result) => ({
    traceId: result.traceID,
    rootService: result.rootServiceName,
    rootOperation: result.rootTraceName,
    durationMs: result.durationMs,
    startTime: normalizeTimestamp(result.startTimeUnixNano),
    // Tempo's search API doesn't return status directly - you'd typically
    // query with a status tag filter, or check span status after fetching
    // the full trace. Hardcoding "ok" until that's wired up.
    status: "ok"
  }));
}
