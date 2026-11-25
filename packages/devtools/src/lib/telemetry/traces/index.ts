import type { Effect, Option } from "effect";

import type { Trace, TraceListFilters, TraceSummary } from "#lib/domain/types.js";

import { TempoCollector } from "./tempo/TempoCollector.js";
import type { TraceSourceError } from "./TraceSourceError.js";

/** Supported trace vendors shown in connection settings. */
export const TRACE_VENDORS = [{ value: "tempo", label: "Tempo" }] as const;

/** A supported trace source identifier. */
export type TraceVendor = (typeof TRACE_VENDORS)[number]["value"];

/** Connection settings common to supported trace vendors. */
export type TracesConfig = { url: string };

/** Reads normalized traces without exposing vendor response types. */
export interface TraceCollector {
  getTrace(traceId: string): Effect.Effect<Option.Option<Trace>, TraceSourceError>;
  getLatestTrace(lookbackSeconds: number): Effect.Effect<Option.Option<Trace>, TraceSourceError>;
  listTraces(filters: TraceListFilters): Effect.Effect<Array<TraceSummary>, TraceSourceError>;
}

/** Selects the collector implementation for the configured vendor. */
export function createCollector(vendor: TraceVendor, config: TracesConfig): TraceCollector {
  switch (vendor) {
    case "tempo":
      return new TempoCollector(config.url);
  }
}

/** Checks whether a connection names a supported vendor. */
export function isTraceVendor(value: string): value is TraceVendor {
  return TRACE_VENDORS.some((v) => v.value === value);
}
