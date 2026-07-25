import { Effect } from "effect";
import { importModule } from "./importModule.ts";
import type { AnyMessage, Message, MessageSchema } from "./message.ts";
import type { Consumer } from "./consumer.ts";
import { InvalidSchemaError } from "./errors.ts";

type SchemaExports = AnyMessage | Consumer<string, AnyMessage>;

export interface SchemaData {
  messages: Array<Message<string, MessageSchema>>,
  consumers: Array<Consumer<string, Message<string, MessageSchema>>>;
}

export const loadSchema = Effect.fn(function* (schemaPath: string) {
  const module = yield* importModule(schemaPath);
  const messages = new Map<string, Message<string, MessageSchema>>();
  const consumers = new Map<string, Consumer<string, Message<string, MessageSchema>>>();

  for (const [key, value] of Object.entries(module)) {
    if (key === "default") {
      continue;
    }

    const candidate = value as SchemaExports;

    switch (candidate._tag) {
      case "Message":
        if (!messages.has(candidate.name)) {
          messages.set(candidate.name, candidate);
        }
        break;
      case "Consumer":
        if (!messages.has(candidate.message.name)) {
          messages.set(candidate.message.name, candidate.message);
        }
        consumers.set(candidate.name, candidate);
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
