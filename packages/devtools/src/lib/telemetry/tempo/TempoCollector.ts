import type { ServiceSummary, Trace, TraceListFilters, TraceSummary } from "$lib/domain/types";

import type { TraceCollector } from "../collector";
import { MOCK_SERVICE_SUMMARIES, MOCK_TEMPO_RESPONSE, MOCK_TEMPO_SEARCH_RESPONSE } from "./mock";
import { normalizeSearchResponse, normalizeTrace } from "./normalize";

export class TempoCollector implements TraceCollector {
  readonly #url: string;

  constructor(url: string) {
    this.#url = url;
  }
  async collect(traceId?: string): Promise<Trace> {
    // TODO: real Tempo querying, once we're ready to wire it up.
    /*if (traceId) {
      const res = await fetch(`${this.#url}/api/traces/${traceId}`);
      if (!res.ok) {
        throw new Error(`Tempo returned ${res.status} for trace ${traceId}`);
      }
      const json = await res.json();
      return normalizeTrace(json);
    }

    // No traceId - fetch the most recent trace matching our service.
    // Tempo's search API is something like:
    const searchRes = await fetch(`${this.#url}/api/search?limit=1`);
    if (!searchRes.ok) {
      throw new Error(`Tempo search returned ${searchRes.status}`);
    }

    const searchJson = await searchRes.json();
    const latestTraceId = searchJson.traces?.[0]?.traceID;
    if (!latestTraceId) {
      throw new Error("No traces found");
    }
    return this.collect(latestTraceId);*/

    return normalizeTrace(MOCK_TEMPO_RESPONSE);
  }

  async listTraces(filters?: TraceListFilters): Promise<Array<TraceSummary>> {
    // TODO real version:
    /*const params = new URLSearchParams();
    if (filters?.service) params.set("tags", `service.name=${filters.service}`);
    const res = await fetch(`${this.#url}/api/search?${params}`);
    return normalizeSearchResponse(await res.json());*/

    let summaries = normalizeSearchResponse(MOCK_TEMPO_SEARCH_RESPONSE);

    if (filters?.service) {
      summaries = summaries.filter((s) => s.rootService === filters.service);
    }
    if (filters?.status) {
      summaries = summaries.filter((s) => s.status === filters.status);
    }

    return summaries;
  }

  async listServices(): Promise<Array<ServiceSummary>> {
    // Placeholder - no real metrics endpoint behind this yet.
    return MOCK_SERVICE_SUMMARIES;
  }
}
