import { Effect } from "effect";

import type { Consumer } from "./consumer.ts";
import { InvalidSchemaError } from "./errors.ts";
import { importModule } from "./importModule.ts";
import type { AnyMessage } from "./message.ts";

type SchemaExports = AnyMessage | Consumer<string, AnyMessage>;

export interface SchemaData {
  messages: Map<string, AnyMessage>;
  consumers: Map<string, Consumer<string, AnyMessage>>;
  messageExportNames: Map<string, string>;
  consumerExportNames: Map<string, string>;
}

export const loadSchema = Effect.fn(function* (schemaPath: string) {
  const module = yield* importModule(schemaPath);
  const entries = Object.entries(module).filter(([key]) => key !== "default");

  const messages = new Map<string, AnyMessage>();
  const consumers = new Map<string, Consumer<string, AnyMessage>>();
  const messageExportNames = new Map<string, string>();
  const consumerExportNames = new Map<string, string>();

  const exportNameByMessage = new Map<AnyMessage, string>();
  for (const [key, value] of entries) {
    const candidate = value as SchemaExports;
    if (candidate._tag === "Message") {
      exportNameByMessage.set(candidate, key);
    }
  }

  for (const [key, value] of entries) {
    const candidate = value as SchemaExports;

    switch (candidate._tag) {
      case "Message": {
        if (!messages.has(candidate.name)) {
          messages.set(candidate.name, candidate);
          messageExportNames.set(candidate.name, key);
        }
        break;
      }
      case "Consumer": {
        const exportName = exportNameByMessage.get(candidate.message);
        if (exportName === undefined) {
          return yield* new InvalidSchemaError({
            path: schemaPath,
            reason: `Consumer "${candidate.name}" references a message ("${candidate.message.name}") 
            that is not exported as a top-level binding. Define the message with "export const" and referene it, 
            rather than declaring it inline.`,
          });
        }
        if (!messages.has(candidate.message.name)) {
          messages.set(candidate.message.name, candidate.message);
          messageExportNames.set(candidate.message.name, exportName);
        }
        consumerExportNames.set(candidate.name, key);
        consumers.set(candidate.name, candidate);
        break;
      }
      default:
        return yield* new InvalidSchemaError({
          path: schemaPath,
          reason: `Unsupported export: "${key}". Expected a Message or Consumer.`,
        });
    }
  }

  return { messages, consumers, messageExportNames, consumerExportNames } as SchemaData;
});
