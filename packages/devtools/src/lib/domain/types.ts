type NodeKind = "message" | "handler";

export type TraceStatus = "ok" | "error";
type HealthStatus = "healthy" | "degraded" | "failed";

export interface Attribute {
  key: string;
  value: string;
}

/**
 * Normalized representation of a trace span.
 *
 * This is the canonical trace representation used by SignalGraph.
 * Collectors are responsible for converting their source format into this model.
 */
export interface TraceSpan {
  spanId: string;
  traceId: string;
  parentSpanId?: string;
  name: string;
  startTime: number;
  endTime: number;
  attributes: Array<Attribute>;
}

/**
 * A complete normalized trace.
 */
export interface Trace {
  traceId: string;
  spans: Array<TraceSpan>;
  resourceAttributes: Array<Attribute>;
}

/**
 * A node in the SignalGraph graph.
 *
 * Position, status, throughput, failures, etc. are intentionally excluded.
 * Those are either derived values or UI concerns.
 */
export interface GraphNode {
  id: string;
  label: string;
  kind: NodeKind;
  attributes: Array<Attribute>;
  traceId: string;
}

/**
 * A connection between two graph nodes.
 */
export interface GraphEdge {
  id: string;
  source: string;
  target: string;
}

/**
 * Graph representation derived from a Trace.
 */
export interface Graph {
  nodes: Array<GraphNode>;
  edges: Array<GraphEdge>;
  traceSpans: Array<TraceSpan>;
}

export interface TraceSummary {
  traceId: string;
  rootService: string;
  rootOperation: string;
  durationMs: number;
  startTime: number;
  status: TraceStatus;
}

export interface TraceListFilters {
  service?: string;
  status?: TraceStatus;
}

// Placeholder shape - not backed by a real Tempo endpoint yet.
// Revisit once we know the actual metics source (Tempo metrics-generator, Prometheus, etc).
export interface ServiceSummary {
  name: string;
  status: HealthStatus;
  requestRate: string;
  errorRate: number;
  latencyP50Ms: number;
  lastSeen: number;
}
