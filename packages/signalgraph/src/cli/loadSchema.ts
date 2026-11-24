import { Effect, Match, Predicate } from "effect";

import type { Consumer } from "../Consumer.ts";
import type { AnyMessage } from "../Message.ts";
import { InvalidSchemaError } from "./CliErrors.ts";
import { importModule } from "./importModule.ts";

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

    if (Predicate.isTagged("Message")(candidate)) {
      exportNameByMessage.set(candidate, key);
    }
  }

  for (const [key, value] of entries) {
    const candidate = value as SchemaExports;

    yield* Match.value(candidate).pipe(
      Match.tag("Message", (message) =>
        Effect.sync(() => {
          if (!messages.has(message.name)) {
            messages.set(message.name, message);
            messageExportNames.set(message.name, key);
          }
        })
      ),
      Match.tag("Consumer", (consumer) =>
        Effect.gen(function* () {
          const exportName = exportNameByMessage.get(consumer.message);

          if (exportName === undefined) {
            return yield* new InvalidSchemaError({
              path: schemaPath,
              reason: `Consumer "${consumer.name}" references a message ("${consumer.message.name}") that is not exported as a top-level binding. Define the message with "export const" and reference it, rather than declaring it inline.`
            });
          }

          if (!messages.has(consumer.message.name)) {
            messages.set(consumer.message.name, consumer.message);
            messageExportNames.set(consumer.message.name, exportName);
          }

          consumerExportNames.set(consumer.name, key);
          consumers.set(consumer.name, consumer);
        })
      ),
      Match.orElse(() =>
        Effect.fail(
          new InvalidSchemaError({
            path: schemaPath,
            reason: `Unsupported export: "${key}". Expected a Message or Consumer.`
          })
        )
      )
    );
  }

  return { messages, consumers, messageExportNames, consumerExportNames };
});
