import { getActiveTraceCollector } from "$lib/server/datasources/registry";
import { getGraphLookbackSeconds } from "$lib/server/db/appSettings";
import { json } from "@sveltejs/kit";

import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async () => {
  const collector = getActiveTraceCollector();

  if (!collector) {
    return json({ message: "No active connection." }, { status: 409 });
  }

  const lookbackSeconds = getGraphLookbackSeconds();
  const end = Math.round(Date.now() / 1000);
  const start = end - lookbackSeconds;

  try {
    const traces = await collector.listTraces({ start, end });

    return json({ traces });
  } catch (error) {
    return json(
      { message: error instanceof Error ? error.message : "Unable to load traces." },
      { status: 502 },
    );
  }
};
