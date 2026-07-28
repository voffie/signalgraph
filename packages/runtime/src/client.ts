import { Effect, Schema } from "effect";
import { Broker } from "./broker.ts";
import { InvalidPayloadError } from "./errors.ts";
import type { AnyMessage } from "signalgraph";

export interface Message<P> {
  publish(payload: P): Effect.Effect<void>;
}

export type Handler<P> = (
  ctx: {
    readonly payload: P;
  }
) => Effect.Effect<void>;

export interface Consumer<P> {
  handle(handler: Handler<P>): Effect.Effect<void>;
}

type MessageDefinition = {
  definition: AnyMessage;
  consumers: ReadonlyArray<string>;
};

export type MessageGraph = Record<string, MessageDefinition>;

type ClientShape = Record<
  string,
  Message<unknown> | Consumer<unknown>
>;

const toCamelCase = (text: string) =>
  text
    .split(".")
    .map((part, i) => (i === 0 ? part : part[0].toUpperCase() + part.slice(1)))
    .join("");

export function createClient<T extends ClientShape>(
  graph: MessageGraph
) {
  return Effect.gen(function* () {
    const broker = yield* Broker;

    const client: Record<string, unknown> = {};

    for (const [exportIdentifier, exportData] of Object.entries(graph)) {
      client[toCamelCase(exportIdentifier)] = {
        publish(payload: unknown) {
          return Effect.gen(function* () {
            const encoded = yield* Schema.encodeUnknownEffect(exportData.definition.schema)(payload);

            yield* Effect.forEach(
              exportData.consumers,
              consumer =>
                broker.deliver(consumer, encoded),
              { discard: true }
            );
          });
        }
      };

      for (const consumer of exportData.consumers) {
        client[consumer] = {
          handle(handler: Handler<unknown>) {
            return broker.consume(
              consumer,
              (payload) => Effect.gen(function* () {
                const decoded = yield* Schema.decodeUnknownEffect(exportData.definition.schema)(payload).pipe(
                  Effect.mapError((cause) =>
                    new InvalidPayloadError({
                      message: "Incoming payload does not match defined message schema",
                      cause
                    })
                  )
                );

                return yield* handler({ payload: decoded });
              })
            );
          }
        };
      }
    };

    return client as T;
  });
}
