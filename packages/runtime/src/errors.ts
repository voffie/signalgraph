import { Schema } from "effect";

export class InvalidPayloadError extends Schema.TaggedErrorClass<InvalidPayloadError>()("InvalidPayloadError", {
  message: Schema.String,
  cause: Schema.Unknown
}) { }
