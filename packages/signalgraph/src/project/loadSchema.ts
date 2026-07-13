import { Effect, Schema } from "effect";
import { importModule } from "./importModule.ts";
import type { Message } from "../message.ts";
import type { Consumer } from "../consumer.ts";

interface Project {
  messages: Message<string, Schema.Decoder<unknown, never>>[],
  consumers: Consumer<string, Message<string, Schema.Decoder<unknown, never>>>[];
}

export const loadSchema = Effect.fn(function* (schemaPath: string) {
  const module = yield* importModule(schemaPath);
  const messages = [];
  const consumers = [];

  for (const value of Object.values(module)) {
    if (value._tag === "Consumer") {
      consumers.push(value);
    } else if (value._tag === "Message") {
      messages.push(value);
    } else {
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
  } as Project;
})
