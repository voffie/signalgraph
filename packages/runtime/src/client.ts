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

export type RuntimeClient = {
  listen(): Effect.Effect<void>;
};

const toCamelCase = (text: string) =>
  text
    .split(".")
    .map((part, i) => (i === 0 ? part : part[0].toUpperCase() + part.slice(1)))
    .join("");

export function createClient<T extends object>(
  graph: MessageGraph
) {
  return Effect.sync(() => {
    const client: Record<string, unknown> = {};
    const handlers = new Map<
      string,
      Array<(payload: unknown) => Effect.Effect<void, InvalidPayloadError>>
    >();

    for (const [exportIdentifier, exportData] of Object.entries(graph)) {
      client[toCamelCase(exportIdentifier)] = {
        publish(payload: unknown) {
          return Effect.gen(function* () {
            const broker = yield* Broker;

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
            return Effect.sync(() => {
              const list = handlers.get(consumer) ?? [];

              list.push((payload) =>
                Effect.gen(function* () {
                  const decoded = yield* Schema.decodeUnknownEffect(exportData.definition.schema)(payload).pipe(
                    Effect.mapError((cause) =>
                      new InvalidPayloadError({
                        message: "Incoming payload does not match defined message schema",
                        cause
                      })
                    )
                  );

                  return yield* handler({
                    payload: decoded
                  });
                })
              );

              handlers.set(consumer, list);
            });
          }
        };
      };
    };

    client.listen = () =>
      Effect.gen(function* () {
        const broker = yield* Broker;

        yield* broker.listen({
          graph,
          handlers
        });
      });

    return client as T;
  });
}
