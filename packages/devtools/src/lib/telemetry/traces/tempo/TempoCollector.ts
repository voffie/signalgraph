import { Effect, Option, Schema } from "effect";

import type { Trace, TraceListFilters, TraceSummary } from "#lib/domain/types.js";

import type { TraceCollector } from "../index.js";
import { TraceSourceError } from "../TraceSourceError.js";
import { normalizeSearchResponse, normalizeTrace } from "./normalize.js";
import { TempoLatestResponse, TempoResponse, TempoSearchResponse } from "./types.js";

const decodeTrace = Schema.decodeSync(Schema.fromJsonString(TempoResponse));
const decodeLatest = Schema.decodeSync(Schema.fromJsonString(TempoLatestResponse));
const decodeSearch = Schema.decodeSync(Schema.fromJsonString(TempoSearchResponse));

function buildTraceQlQuery(filters: TraceListFilters): Option.Option<string> {
  const services = filters.service ?? [];

  if (services.length === 0) return Option.none();

  const clause = services.map((service) => `resource.service.name = ${JSON.stringify(service)}`).join(" || ");

  return Option.some(`{ ${services.length > 1 ? `(${clause})` : clause} }`);
}

const request = (url: string, operation: TraceSourceError["operation"]) =>
  Effect.tryPromise({
    try: (signal) => fetch(url, { signal }),
    catch: (cause) =>
      new TraceSourceError({
        cause,
        operation,
        reason: "Unavailable",
        message: "Cannot reach the trace source. Check the connection and try again."
      })
  });

const rejected = (operation: TraceSourceError["operation"], status: number) =>
  new TraceSourceError({
    cause: status,
    operation,
    reason: status >= 500 || status === 429 ? "Unavailable" : "RejectedRequest",
    message: "The active trace source rejected the request. Check the connection settings."
  });

const readResponse = <A>(response: Response, operation: TraceSourceError["operation"], read: (text: string) => A) =>
  Effect.tryPromise({
    try: async () => read(await response.text()),
    catch: (cause) =>
      new TraceSourceError({
        cause,
        operation,
        reason: "InvalidResponse",
        message: "Cannot read traces from the active connection. Check that it points to a compatible trace source."
      })
  });

/** Fetches and validates trace data from a Tempo data source. */
export class TempoCollector implements TraceCollector {
  readonly #url: string;

  constructor(url: string) {
    this.#url = url;
  }

  /** Looks up one trace. A missing trace resolves to None. */
  getTrace(traceId: string): Effect.Effect<Option.Option<Trace>, TraceSourceError> {
    return this.#readTrace(traceId, "getTrace");
  }

  #readTrace(traceId: string, operation: "getTrace" | "getLatestTrace") {
    const url = `${this.#url}/api/v2/traces/${encodeURIComponent(traceId)}`;

    return Effect.gen(function* () {
      const res = yield* request(url, operation);

      if (res.status === 404) return Option.none<Trace>();

      if (!res.ok) return yield* rejected(operation, res.status);

      const trace = yield* readResponse(res, operation, (text) => normalizeTrace(decodeTrace(text)));

      return Option.some(trace);
    });
  }

  /** Searches the lookback window and fetches the most recent matching trace. */
  getLatestTrace(lookbackSeconds: number): Effect.Effect<Option.Option<Trace>, TraceSourceError> {
    return Effect.gen({ self: this }, function* () {
      const now = Math.floor(Date.now() / 1000);

      const params = new URLSearchParams({
        q: "{} with (most_recent=true)",
        limit: "1",
        start: String(now - lookbackSeconds),
        end: String(now)
      });

      const response = yield* request(`${this.#url}/api/search?${params}`, "getLatestTrace");

      if (!response.ok) return yield* rejected("getLatestTrace", response.status);

      const search = yield* readResponse(response, "getLatestTrace", (text) => decodeLatest(text));
      const latest = search.traces?.[0];

      return latest === undefined ? Option.none() : yield* this.#readTrace(latest.traceID, "getLatestTrace");
    });
  }

  /** Lists trace summaries with optional filtering by service name. */
  listTraces(filters: TraceListFilters): Effect.Effect<Array<TraceSummary>, TraceSourceError> {
    return Effect.gen({ self: this }, function* () {
      const params = new URLSearchParams({ start: String(filters.start), end: String(filters.end) });
      const query = buildTraceQlQuery(filters);

      if (Option.isSome(query)) params.set("q", query.value);

      const response = yield* request(`${this.#url}/api/search?${params}`, "listTraces");

      if (!response.ok) return yield* rejected("listTraces", response.status);

      return yield* readResponse(response, "listTraces", (text) => normalizeSearchResponse(decodeSearch(text)));
    });
  }
}
