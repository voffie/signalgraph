import type { ServiceSummary, Trace, TraceListFilters, TraceSummary } from "$lib/domain/types";

export interface TraceCollector {
  collect(traceId?: string): Promise<Trace>;
  listTraces(filters?: TraceListFilters): Promise<Array<TraceSummary>>;
  // Not vendor-backed yet - see ServiceSummary comment in domain/types.ts.
  listServices(): Promise<Array<ServiceSummary>>;
}

export type CollectorConfig =
  | {
    type: "tempo";
    url: string;
  };
