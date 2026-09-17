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

  if (filters.status?.length) {
    const clause = filters.status
      .map((s) => `status = "${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`)
      .join(" || ");

    conditions.push(filters.status.length > 1 ? `(${clause})` : clause);
  }

  if (!conditions.length) return undefined;
  return `{ ${conditions.join(" && ")} }`;
}

export class TempoCollector implements TraceCollector {
  readonly #url: string;

  constructor(url: string) {
    this.#url = url;
  }

  async collect({
    traceId,
    lookbackSeconds,
  }: {
    traceId?: string;
    lookbackSeconds: number;
  }): Promise<Trace> {
    if (traceId) {
      const res = await fetch(`${this.#url}/api/v2/traces/${traceId}`);

      if (res.status === 404) {
        throw new Error(`Trace ${traceId} not found`);
      }

      if (!res.ok) {
        throw new Error(`Tempo returned ${res.status} for trace ${traceId}`);
      }

      const json = await res.json();
      return normalizeTrace(json);
    }

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
    const latestTraceId = searchJson.traces?.[0]?.traceID;

    if (!latestTraceId) {
      throw new Error("No traces found");
    }

    return this.collect({ traceId: latestTraceId, lookbackSeconds });
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
