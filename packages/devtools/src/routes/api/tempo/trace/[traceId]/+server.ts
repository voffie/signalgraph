import { json, error } from "@sveltejs/kit";

import type { RequestHandler } from "./$types";

const TEMPO_URL = "http://localhost:3200";

export const GET: RequestHandler = async ({ params, fetch }) => {
  const response = await fetch(`${TEMPO_URL}/api/v2/traces/${params.traceId}`);

  if (!response.ok) {
    throw error(response.status, `Tempo returned ${response.status}`);
  }

  return json(await response.json());
};
