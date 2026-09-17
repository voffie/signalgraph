import { type TraceCollector, createCollector } from "$lib/telemetry/traces";

import { getActiveDataSource } from "../db/dataSource";

export function getActiveTraceCollector(): TraceCollector | null {
  const source = getActiveDataSource();
  return source ? createCollector(source.vendor, source.config) : null;
}
