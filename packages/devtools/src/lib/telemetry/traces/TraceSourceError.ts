import { Schema } from "effect";

/** Classifies a failed trace read without exposing the vendor's response or request URL. */
export class TraceSourceError extends Schema.TaggedError<TraceSourceError>()("TraceSourceError", {
  operation: Schema.Literals(["getTrace", "getLatestTrace", "listTraces"]),
  reason: Schema.Literals(["Unavailable", "RejectedRequest", "InvalidResponse"]),
  message: Schema.String,
  cause: Schema.Unknown
}) {}
