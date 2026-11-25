import { Effect, Match, Schema } from "effect";

import { ConsumerDeclaration } from "../Consumer.ts";
import { toPropertyName } from "../internal/naming.ts";
import { MessageDeclaration } from "../Message.ts";
import { InvalidSchemaError } from "./CliErrors.ts";
import { importModule } from "./importModule.ts";

// Structural validation works across source and built imports and retains the original message object for linking.
const isSchemaExport = Schema.is(Schema.Union([MessageDeclaration, ConsumerDeclaration]));

/** Collects exported message definitions and consumer declarations for client generation. */
export interface SchemaData {
  messages: Map<string, typeof MessageDeclaration.Type>;
  consumers: Map<string, typeof ConsumerDeclaration.Type>;
  messageExportNames: Map<string, string>;
  consumerExportNames: Map<string, string>;
}

/** Validates a schema module and resolves consumers against its exported message objects. */
export const loadSchema = Effect.fn(function* (schemaPath: string) {
  const module = yield* importModule(schemaPath);
  const entries = Object.entries(module).filter(([key]) => key !== "default");

  const messages: SchemaData["messages"] = new Map();
  const consumers: SchemaData["consumers"] = new Map();
  const messageExportNames = new Map<string, string>();
  const consumerExportNames = new Map<string, string>();

  const consumerEntries = new Map<string, typeof ConsumerDeclaration.Type>();
  const exportNameByMessage = new Map<typeof MessageDeclaration.Type, string>();

  for (const [key, value] of entries) {
    if (!isSchemaExport(value)) {
      return yield* new InvalidSchemaError({
        path: schemaPath,
        reason: `Export "${key}" is not a message or consumer declaration. Use message() or consumer(), or remove the export.`
      });
    }

    yield* Match.value(value).pipe(
      Match.tag("Message", (message) =>
        Effect.gen(function* () {
          const existing = messages.get(message.name);

          if (existing !== undefined && existing !== message) {
            return yield* new InvalidSchemaError({
              path: schemaPath,
              reason: `More than one message declares the name "${message.name}". Give each message a unique name.`
            });
          }

          if (existing === undefined) {
            messages.set(message.name, message);
            messageExportNames.set(message.name, key);
            exportNameByMessage.set(message, key);
          }
        })
      ),
      Match.tag("Consumer", (consumer) => Effect.sync(() => void consumerEntries.set(key, consumer))),
      Match.exhaustive
    );
  }

  for (const [key, consumer] of consumerEntries) {
    if (!exportNameByMessage.has(consumer.message)) {
      return yield* new InvalidSchemaError({
        path: schemaPath,
        reason: `Consumer "${consumer.name}" references unexported message "${consumer.message.name}". Export the message and reference that declaration.`
      });
    }

    if (consumers.has(consumer.name)) {
      return yield* new InvalidSchemaError({
        path: schemaPath,
        reason: `More than one consumer declares the name "${consumer.name}". Give each consumer a unique name.`
      });
    }

    consumerExportNames.set(consumer.name, key);
    consumers.set(consumer.name, consumer);
  }

  const properties = new Set(["start", "listen"]);

  for (const name of [...messages.keys(), ...consumers.keys()]) {
    const property = toPropertyName(name);

    if (properties.has(property)) {
      return yield* new InvalidSchemaError({
        path: schemaPath,
        reason: `"${name}" maps to the reserved or duplicate client property "${property}". Rename the message or consumer.`
      });
    }

    properties.add(property);
  }

  return { messages, consumers, messageExportNames, consumerExportNames };
});
