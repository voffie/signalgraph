import type { TraceCollector, CollectorConfig } from "./collector";
import { TempoCollector } from "./tempo/TempoCollector";

export function createCollector(
  config: CollectorConfig
): TraceCollector {
  switch (config.type) {
    case "tempo":
      return new TempoCollector(config.url);
  }
}
