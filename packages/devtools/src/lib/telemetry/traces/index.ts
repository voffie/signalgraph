import type { Trace, TraceListFilters, TraceSummary } from "$lib/domain/types";

import { TempoCollector } from "./tempo/TempoCollector";

export const TRACE_VENDORS = [{ value: "tempo", label: "Tempo" }] as const;

export type TraceVendor = (typeof TRACE_VENDORS)[number]["value"];
export type TracesConfig = { url: string };

export interface TraceCollector {
  collect(args: { traceId?: string; lookbackSeconds: number }): Promise<Trace>;
  listTraces(filters: TraceListFilters): Promise<Array<TraceSummary>>;
}

export function createCollector(vendor: TraceVendor, config: TracesConfig): TraceCollector {
  switch (vendor) {
    case "tempo":
      return new TempoCollector(config.url);
  }
}

export function isTraceVendor(value: string): value is TraceVendor {
  return TRACE_VENDORS.some((v) => v.value === value);
}
