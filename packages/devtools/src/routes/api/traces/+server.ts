import { getActiveTraceCollector } from "#lib/server/datasources/registry.js";
import { getGraphLookbackSeconds } from "#lib/server/db/appSettings.js";

import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async () => {
  const collector = getActiveTraceCollector();

  if (!collector) {
    return Response.json({ message: "No active connection." }, { status: 409 });
  }

  const lookbackSeconds = getGraphLookbackSeconds();
  const end = Math.round(Date.now() / 1000);
  const start = end - lookbackSeconds;

  try {
    const traces = await collector.listTraces({ start, end });

    return Response.json({ traces });
  } catch (error) {
    return Response.json(
      { message: error instanceof Error ? error.message : "Unable to load traces." },
      { status: 502 }
    );
  }
};
