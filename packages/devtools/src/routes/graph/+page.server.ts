import { getActiveCollector } from "$lib/server/datasources/registry";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ url, depends }) => {
  depends("app:trace");

  const collector = getActiveCollector();
  if (!collector) return { trace: null, error: null };

  const traceId = url.searchParams.get("trace") ?? undefined;

  try {
    const trace = await collector.collect(traceId);
    return { trace, error: null };
  } catch (err) {
    return {
      trace: null,
      error: err instanceof Error ? err.message : "Unable to load trace"
    };
  }
}
