import { Schema } from "effect";

export class InvalidPayloadError extends Schema.TaggedError<InvalidPayloadError>()("InvalidPayloadError", {
  message: Schema.String,
  cause: Schema.Unknown
}) { }

export class ConnectionError extends Schema.TaggedError<ConnectionError>()("ConnectionError", {
  message: Schema.String,
  cause: Schema.Unknown
}) { }

export class ConsumeError extends Schema.TaggedError<ConsumeError>()("ConsumeError", {
  message: Schema.String,
  cause: Schema.Unknown
}) { }

export class InitializationError extends Schema.TaggedError<InitializationError>()("InitializationError", {
  message: Schema.String,
  cause: Schema.Unknown
}) { }

export class ValidationError extends Schema.TaggedError<ValidationError>()("ValidationError", {
  message: Schema.String,
  area: Schema.String
}) { }
