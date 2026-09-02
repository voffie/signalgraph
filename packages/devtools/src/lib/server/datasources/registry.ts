import { getDataSourceConfig } from "../db/dataSource";
import { createCollector } from "$lib/telemetry/collectorFactory";
import type { TraceCollector } from "$lib/telemetry/collector";

export function getActiveCollector(): TraceCollector | null {
  const config = getDataSourceConfig();
  return config ? createCollector(config) : null;
}
