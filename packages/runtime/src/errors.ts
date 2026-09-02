import { Schema } from "effect";

export class InvalidPayloadError extends Schema.TaggedErrorClass<InvalidPayloadError>()(
  "InvalidPayloadError",
  {
    message: Schema.String,
    cause: Schema.Unknown,
  },
) {}

export class ConnectionError extends Schema.TaggedErrorClass<ConnectionError>()("ConnectionError", {
  message: Schema.String,
  cause: Schema.Unknown,
}) {}

export class ConsumeError extends Schema.TaggedErrorClass<ConsumeError>()("ConsumeError", {
  message: Schema.String,
  cause: Schema.Unknown,
}) {}

export class InitializationError extends Schema.TaggedErrorClass<InitializationError>()(
  "InitializationError",
  {
    message: Schema.String,
    cause: Schema.Unknown,
  },
) {}

export class ValidationError extends Schema.TaggedErrorClass<ValidationError>()("ValidationError", {
  message: Schema.String,
  area: Schema.String,
}) {}
