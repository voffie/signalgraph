import { getActiveCollector } from "$lib/server/datasources/registry";

import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async () => {
  const collector = getActiveCollector();
  if (!collector) return { services: [], error: null };

  try {
    const services = await collector.listServices();
    return { services, error: null };
  } catch (err) {
    return { services: [], error: err instanceof Error ? err.message : "Unable to load services" };
  }
};
