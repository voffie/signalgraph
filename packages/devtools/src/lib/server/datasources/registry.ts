import type { TraceCollector } from "$lib/telemetry/collector";
import { createCollector } from "$lib/telemetry/collectorFactory";

import { getDataSourceConfig } from "../db/dataSource";

export function getActiveCollector(): TraceCollector | null {
  const config = getDataSourceConfig();
  return config ? createCollector(config) : null;
}
