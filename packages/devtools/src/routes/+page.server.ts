import { Effect, Option } from "effect";

import { getActiveTraceCollector } from "#lib/server/datasources/registry.js";
import { getGraphLookbackSeconds } from "#lib/server/db/appSettings.js";
import { listDataSources } from "#lib/server/db/dataSource.js";

import type { PageServerLoad } from "./$types";

/** Loads the requested trace or the most recent trace from the active connection. */
export const load: PageServerLoad = async ({ url }) => {
  const dataSources = listDataSources();
  const hasAnyDataSource = dataSources.length > 0;
  const hasActiveDataSource = dataSources.some((source) => source.isActive);
  const graphLookbackSeconds = getGraphLookbackSeconds();

  const collector = getActiveTraceCollector();

  if (Option.isNone(collector)) {
    return {
      trace: null,
      error: null,
      hasAnyDataSource,
      hasActiveDataSource,
      dataSources,
      graphLookbackSeconds
    };
  }

  const traceId = url.searchParams.get("trace");
  const readTrace = traceId ? collector.value.getTrace(traceId) : collector.value.getLatestTrace(graphLookbackSeconds);

  const result = await Effect.runPromise(
    readTrace.pipe(
      Effect.map((trace) => ({ trace: Option.getOrNull(trace), error: null })),
      Effect.catchTag("TraceSourceError", (error) => Effect.succeed({ trace: null, error: error.message }))
    )
  );

  return { ...result, hasAnyDataSource, hasActiveDataSource, dataSources, graphLookbackSeconds };
};
