import { getActiveTraceCollector } from "$lib/server/datasources/registry";
import { getGraphLookbackSeconds } from "$lib/server/db/appSettings";
import { listDataSources } from "$lib/server/db/dataSource";
import { redirect } from "@sveltejs/kit";

import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ url }) => {
  const dataSources = listDataSources();
  const hasActiveDataSource = dataSources.some((d) => d.isActive);
  const graphLookbackSeconds = getGraphLookbackSeconds();

  const end = Math.round(Date.now() / 1000);
  const start = end - graphLookbackSeconds;

  const collector = getActiveTraceCollector();
  if (!collector) {
    return {
      trace: null,
      traces: null,
      error: null,
      hasAnyDataSource: dataSources.length > 0,
      hasActiveDataSource,
      dataSources,
      graphLookbackSeconds,
    };
  }

  const traceId = url.searchParams.get("trace") ?? undefined;

  let trace;
  try {
    trace = await collector.collect({ traceId, lookbackSeconds: graphLookbackSeconds });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unable to load trace";

    return {
      trace: null,
      traces: null,
      error: message === "No traces found" ? null : message,
      hasAnyDataSource: true,
      hasActiveDataSource: true,
      dataSources,
      graphLookbackSeconds,
    };
  }

  let traces;
  try {
    traces = await collector.listTraces({ start, end });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unable to search traces";

    return {
      trace: null,
      traces: null,
      error: message === "Unable to search traces" ? null : message,
      hasAnyDataSource: true,
      hasActiveDataSource: true,
      dataSources,
      graphLookbackSeconds,
    };
  }

  if (!traceId) {
    redirect(307, `/?trace=${trace.traceId}`);
  }

  return {
    trace,
    traces,
    error: null,
    hasAnyDataSource: true,
    hasActiveDataSource: true,
    dataSources,
    graphLookbackSeconds,
  };
};
