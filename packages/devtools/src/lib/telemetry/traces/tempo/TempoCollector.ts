import type { Trace, TraceListFilters, TraceSummary } from "$lib/domain/types";

import type { TraceCollector } from "../index";
import { normalizeSearchResponse, normalizeTrace } from "./normalize";

function buildTraceQlQuery(filters: TraceListFilters): string | undefined {
  const conditions: Array<string> = [];

  if (filters.service?.length) {
    const clause = filters.service
      .map((s) => `resource.service.name = "${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`)
      .join(" || ");

    conditions.push(filters.service.length > 1 ? `(${clause})` : clause);
  }

  if (!conditions.length) return undefined;
  return `{ ${conditions.join(" && ")} }`;
}

export class TempoCollector implements TraceCollector {
  readonly #url: string;

  constructor(url: string) {
    this.#url = url;
  }

  async getTrace(traceId: string): Promise<Trace | null> {
    const res = await fetch(`${this.#url}/api/v2/traces/${traceId}`);

    if (res.status === 404) {
      return null;
    }

    if (!res.ok) {
      throw new Error(`Tempo returned ${res.status} for trace ${traceId}`);
    }

    const json = await res.json();
    return normalizeTrace(json);
  }

  async getLatestTrace(lookbackSeconds: number): Promise<Trace | null> {
    const now = Math.floor(Date.now() / 1000);

    const params = new URLSearchParams();
    params.set("q", "{} with (most_recent=true)");
    params.set("limit", "1");
    params.set("start", `${now - lookbackSeconds}`);
    params.set("end", `${now}`);

    const searchRes = await fetch(`${this.#url}/api/search?${params}`);

    if (!searchRes.ok) {
      throw new Error(`Tempo search returned ${searchRes.status}`);
    }

    const searchJson = await searchRes.json();
    const traceId = searchJson.traces?.[0]?.traceID;

    return traceId ? this.getTrace(traceId) : null;
  }

  async listTraces(filters: TraceListFilters): Promise<Array<TraceSummary>> {
    const params = new URLSearchParams();

    params.set("start", `${filters.start}`);
    params.set("end", `${filters.end}`);

    const query = buildTraceQlQuery(filters);
    if (query) params.set("q", query);

    const res = await fetch(`${this.#url}/api/search?${params}`);

    if (!res.ok) {
      throw new Error(`Tempo search failed: ${res.status} ${res.statusText}`);
    }

    const json = await res.json();
    return normalizeSearchResponse(json);
  }
}
