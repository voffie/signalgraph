import { Schema } from "effect";

/** A payload cannot cross the message codec or transport boundary. */
export class InvalidPayloadError extends Schema.TaggedError<InvalidPayloadError>()("InvalidPayloadError", {
  message: Schema.String,
  cause: Schema.Unknown
}) {}

/** A broker transport operation failed. A failed publish confirm may leave delivery uncertain. */
export class ConnectionError extends Schema.TaggedError<ConnectionError>()("ConnectionError", {
  message: Schema.String,
  cause: Schema.Unknown
}) {}

/** A delivery could not be consumed. */
export class ConsumeError extends Schema.TaggedError<ConsumeError>()("ConsumeError", {
  message: Schema.String,
  cause: Schema.Unknown
}) {}

/** Broker setup could not establish the requested configuration or topology. */
export class InitializationError extends Schema.TaggedError<InitializationError>()("InitializationError", {
  message: Schema.String,
  cause: Schema.Unknown
}) {}

/** The client configuration or handler registry cannot support the requested operation. */
export class ValidationError extends Schema.TaggedError<ValidationError>()("ValidationError", {
  message: Schema.String,
  area: Schema.String
}) {}
