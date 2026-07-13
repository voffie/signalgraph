import { Effect, Schema } from "effect";
import { importModule } from "./importModule.ts";
import type { Message } from "./message.ts";
import type { Consumer } from "./consumer.ts";

export interface SchemaData {
  messages: Message<string, Schema.Decoder<unknown, never>>[],
  consumers: Consumer<string, Message<string, Schema.Decoder<unknown, never>>>[];
}

export const loadSchema = Effect.fn(function* (schemaPath: string) {
  const module = yield* importModule(schemaPath);
  const messages = [];
  const consumers = [];

  for (const value of Object.values(module)) {
    switch (value._tag) {
      case "Message":
        messages.push(value);
        break;
      case "Consumer":
        consumers.push(value);
        break;
      default:
        return yield* Effect.fail(
          new Error(
            "Schema containing unsupported module"
          )
        );
    }
  }

  return {
    messages,
    consumers
  } as SchemaData;
})
