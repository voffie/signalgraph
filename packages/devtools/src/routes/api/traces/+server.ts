import { randomUUID } from "node:crypto";

import { Effect, Option, Schema } from "effect";

import { getActiveTraceCollector } from "#lib/server/datasources/registry.js";
import { getGraphLookbackSeconds } from "#lib/server/db/appSettings.js";

import type { RequestHandler } from "./$types";

const TraceListError = Schema.Union([
  Schema.Struct({
    code: Schema.Literal("NO_ACTIVE_TRACE_CONNECTION"),
    message: Schema.String,
    details: Schema.Struct({ operation: Schema.Literal("listTraces"), reason: Schema.Literal("noActiveConnection") }),
    retryable: Schema.Literal(false)
  }),
  Schema.Struct({
    code: Schema.Literal("TRACE_SOURCE_UNAVAILABLE"),
    message: Schema.String,
    details: Schema.Struct({ operation: Schema.Literal("listTraces"), reason: Schema.Literal("Unavailable") }),
    requestId: Schema.String,
    retryable: Schema.Literal(true)
  }),
  Schema.Struct({
    code: Schema.Literal("TRACE_SOURCE_INCOMPATIBLE"),
    message: Schema.String,
    details: Schema.Struct({
      operation: Schema.Literal("listTraces"),
      reason: Schema.Literals(["RejectedRequest", "InvalidResponse"])
    }),
    requestId: Schema.String,
    retryable: Schema.Literal(false)
  })
]);

const traceListFailure = (error: typeof TraceListError.Type, status: 409 | 500 | 503) =>
  Response.json(error, { status });

/** Returns selectable traces from the active connection without exposing vendor errors. */
export const GET: RequestHandler = async () => {
  const collector = getActiveTraceCollector();

  if (Option.isNone(collector)) {
    return traceListFailure(
      {
        code: "NO_ACTIVE_TRACE_CONNECTION",
        message: "Cannot list traces without an active connection. Select a trace connection in settings.",
        details: { operation: "listTraces", reason: "noActiveConnection" },
        retryable: false
      },
      409
    );
  }

  const lookbackSeconds = getGraphLookbackSeconds();
  const end = Math.round(Date.now() / 1000);
  const start = end - lookbackSeconds;

  return Effect.runPromise(
    collector.value.listTraces({ start, end }).pipe(
      Effect.map((traces) => Response.json({ traces })),
      Effect.catchTag("TraceSourceError", (error) =>
        Effect.gen(function* () {
          const requestId = randomUUID();

          yield* Effect.logWarning("Could not list traces from the active connection").pipe(
            Effect.annotateLogs({ requestId, operation: error.operation, reason: error.reason })
          );

          if (error.reason === "Unavailable") {
            return traceListFailure(
              {
                code: "TRACE_SOURCE_UNAVAILABLE",
                message: error.message,
                details: { operation: "listTraces", reason: error.reason },
                requestId,
                retryable: true
              },
              503
            );
          }

          return traceListFailure(
            {
              code: "TRACE_SOURCE_INCOMPATIBLE",
              message: error.message,
              details: { operation: "listTraces", reason: error.reason },
              requestId,
              retryable: false
            },
            500
          );
        })
      )
    )
  );
};
