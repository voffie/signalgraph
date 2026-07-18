import { Effect } from "effect";
import { importModule } from "./importModule.ts";
import type { Message, MessageSchema } from "./message.ts";
import type { Consumer } from "./consumer.ts";
import { InvalidSchemaError } from "./errors.ts";

export interface SchemaData {
  messages: Message<string, MessageSchema>[],
  consumers: Consumer<string, Message<string, MessageSchema>>[];
}

export const loadSchema = Effect.fn(function* (schemaPath: string) {
  const module = yield* importModule(schemaPath);
  const messages = new Map<string, Message<string, MessageSchema>>();
  const consumers = new Map<string, Consumer<string, Message<string, MessageSchema>>>();

  for (const [key, value] of Object.entries(module)) {
    if (key === "default") {
      continue;
    }

    switch (value._tag) {
      case "Message":
        if (!messages.has(value.name)) {
          messages.set(value.name, value);
        }
        break;
      case "Consumer":
        if (!messages.has(value.message.name)) {
          messages.set(value.message.name, value.message);
        }
        consumers.set(value.name, value);
        break;
      default:
        return yield* new InvalidSchemaError({
          path: schemaPath,
          reason: `Unsupported export: "${key}". Expected a Message or Consumer.`
        });
    }
  }

  return {
    messages: [...messages.values()],
    consumers: [...consumers.values()]
  } as SchemaData;
})
