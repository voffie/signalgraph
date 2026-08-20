export interface TempoAttributeValue {
  stringValue?: string;
  boolValue?: boolean;
  intValue?: string;
  doubleValue?: number;
  bytesValue?: string;
  arrayValue?: {
    values: Array<TempoAttributeValue>;
  };
  kvlistValue?: {
    values: Array<TempoAttribute>;
  };
}

export interface TempoAttribute {
  key: string;
  value: TempoAttributeValue;
}

export interface TempoSpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  startTimeUnixNano: string;
  endTimeUnixNano: string;
  attributes: Array<TempoAttribute>;
}

interface TempoResource {
  attributes: Array<TempoAttribute>;
}

interface TempoScope {
  name: string;
}

interface TempoScopeSpans {
  scope: TempoScope;
  spans: Array<TempoSpan>;
}

interface TempoResourceSpans {
  resource: TempoResource;
  scopeSpans: Array<TempoScopeSpans>;
}

interface TempoTrace {
  resourceSpans: Array<TempoResourceSpans>;
}

export interface TempoResponse {
  trace: TempoTrace;
}
