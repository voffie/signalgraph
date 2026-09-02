import type { TraceStatus } from "$lib/domain/types";
import { getActiveCollector } from "$lib/server/datasources/registry";

import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ url }) => {
  const collector = getActiveCollector();
  if (!collector) return { traces: [], error: null };

  const service = url.searchParams.get("service") ?? undefined;
  const status = (url.searchParams.get("status") as TraceStatus | null) ?? undefined;

  try {
    const traces = await collector.listTraces({ service, status });
    return { traces, error: null };
  } catch (err) {
    return { traces: [], error: err instanceof Error ? err.message : "Unable to load traces" };
  }
};
