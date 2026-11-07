import { type TraceCollector, createCollector } from "#lib/telemetry/traces/index.js";

import { getActiveDataSource } from "../db/dataSource.js";

export function getActiveTraceCollector(): TraceCollector | null {
  const source = getActiveDataSource();
  return source ? createCollector(source.vendor, source.config) : null;
}
