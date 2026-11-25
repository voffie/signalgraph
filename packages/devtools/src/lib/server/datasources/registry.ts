import { Option } from "effect";

import { type TraceCollector, createCollector } from "#lib/telemetry/traces/index.js";

import { getActiveDataSource } from "../db/dataSource.js";

/** Creates a collector for the selected connection, if one exists. */
export function getActiveTraceCollector(): Option.Option<TraceCollector> {
  const source = getActiveDataSource();

  return Option.map(source, ({ vendor, config }) => createCollector(vendor, config));
}
