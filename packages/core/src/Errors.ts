import { Schema } from "effect";

export class InvalidMessagePayload extends Schema.TaggedErrorClass<InvalidMessagePayload>
  ()("InvalidMessagePayload", {
    messageName: Schema.String,
    payload: Schema.Unknown,
    cause: Schema.Unknown,
  }) { }
