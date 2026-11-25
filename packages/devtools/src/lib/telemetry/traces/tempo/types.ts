import { Schema } from "effect";

interface TempoAttributeValue {
  readonly stringValue?: string;
  readonly boolValue?: boolean;
  readonly intValue?: string;
  readonly doubleValue?: number;
  readonly bytesValue?: string;
  readonly arrayValue?: { readonly values: ReadonlyArray<TempoAttributeValue> };
  readonly kvlistValue?: { readonly values: ReadonlyArray<TempoAttribute> };
}

const AttributeValue: Schema.Codec<TempoAttributeValue> = Schema.suspend(() =>
  Schema.Struct({
    stringValue: Schema.optionalKey(Schema.String),
    boolValue: Schema.optionalKey(Schema.Boolean),
    intValue: Schema.optionalKey(Schema.String),
    doubleValue: Schema.optionalKey(Schema.Finite),
    bytesValue: Schema.optionalKey(Schema.String),
    arrayValue: Schema.optionalKey(Schema.Struct({ values: Schema.Array(AttributeValue) })),
    kvlistValue: Schema.optionalKey(Schema.Struct({ values: Schema.Array(Attribute) }))
  })
);

const Attribute = Schema.Struct({ key: Schema.String, value: AttributeValue });
const Timestamp = Schema.String.check(Schema.isPattern(/^\d+$/));

const Span = Schema.Struct({
  traceId: Schema.NonEmptyString,
  spanId: Schema.NonEmptyString,
  parentSpanId: Schema.optionalKey(Schema.String),
  name: Schema.String,
  startTimeUnixNano: Timestamp,
  endTimeUnixNano: Timestamp,
  attributes: Schema.optionalKey(Schema.Array(Attribute))
});

/** Decodes the Tempo v2 trace envelope and nested OTLP span data. */
export const TempoResponse = Schema.Struct({
  trace: Schema.Struct({
    resourceSpans: Schema.Array(
      Schema.Struct({
        resource: Schema.optionalKey(Schema.Struct({ attributes: Schema.optionalKey(Schema.Array(Attribute)) })),
        scopeSpans: Schema.Array(Schema.Struct({ spans: Schema.Array(Span) }))
      })
    )
  })
});

/** Decodes the projected fields used to follow Tempo's latest-trace search. */
export const TempoLatestResponse = Schema.Struct({
  traces: Schema.optionalKey(Schema.Array(Schema.Struct({ traceID: Schema.NonEmptyString })))
});

/** Decodes Tempo search summaries. Tempo may omit traces when the search is empty. */
export const TempoSearchResponse = Schema.Struct({
  traces: Schema.optionalKey(
    Schema.Array(
      Schema.Struct({
        traceID: Schema.NonEmptyString,
        rootServiceName: Schema.String,
        rootTraceName: Schema.String,
        startTimeUnixNano: Timestamp,
        durationMs: Schema.Finite
      })
    )
  )
});

type TempoAttribute = typeof Attribute.Type;

export type { TempoAttribute, TempoAttributeValue };

/** A vendor span before IDs and nanosecond timestamps are normalized. */
export type TempoSpan = typeof Span.Type;
