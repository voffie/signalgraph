import { getActiveTraceCollector } from "$lib/server/datasources/registry";
import { getGraphLookbackSeconds } from "$lib/server/db/appSettings";
import { listDataSources } from "$lib/server/db/dataSource";

import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ url }) => {
  const dataSources = listDataSources();
  const hasAnyDataSource = dataSources.length > 0;
  const hasActiveDataSource = dataSources.some((source) => source.isActive);
  const graphLookbackSeconds = getGraphLookbackSeconds();

  const collector = getActiveTraceCollector();

  if (!collector) {
    return {
      trace: null,
      error: null,
      hasAnyDataSource,
      hasActiveDataSource,
      dataSources,
      graphLookbackSeconds,
    };
  }

  try {
    const traceId = url.searchParams.get("trace");

    const trace = traceId
      ? await collector.getTrace(traceId)
      : await collector.getLatestTrace(graphLookbackSeconds);

    return {
      trace,
      error: null,
      hasAnyDataSource,
      hasActiveDataSource,
      dataSources,
      graphLookbackSeconds,
    };
  } catch (error) {
    return {
      trace: null,
      error: error instanceof Error ? error.message : "Unable to load trace",
      hasAnyDataSource,
      hasActiveDataSource,
      dataSources,
      graphLookbackSeconds,
    };
  }
};
