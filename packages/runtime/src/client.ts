import { Effect, Schema } from "effect";
import {
  Broker,
  type HandlerRegistry,
} from "./broker.ts";
import { InvalidPayloadError } from "./errors.ts";
import type { AnyMessage } from "signalgraph";
import { validateRuntime } from "./validation.ts";

export interface Message<P> {
  publish(payload: P): Effect.Effect<void>;
}

export type UserHandler<P> = (
  ctx: {
    readonly payload: P;
  }
) => Effect.Effect<void>;

export interface Consumer<P> {
  handle(handler: UserHandler<P>): Effect.Effect<void>;
}

type MessageDefinition = {
  definition: AnyMessage;
  consumers: ReadonlyArray<string>;
};

export type MessageGraph = Record<string, MessageDefinition>;

export type RuntimeClient = {
  start(): Effect.Effect<void>;
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
    const handlers: HandlerRegistry = new Map();

    for (const [exportIdentifier, exportData] of Object.entries(graph)) {
      client[toCamelCase(exportIdentifier)] = {
        publish(payload: unknown) {
          return Effect.gen(function* () {
            const broker = yield* Broker;

            const encoded = yield* Schema.encodeUnknownEffect(exportData.definition.schema)(payload);

            yield* broker.deliver(
              exportIdentifier,
              encoded
            );
          });
        }
      };

      for (const consumer of exportData.consumers) {
        client[consumer] = {
          handle(handler: UserHandler<unknown>) {
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

    client.start = () =>
      Effect.gen(function* () {
        const broker = yield* Broker;

        yield* validateRuntime(graph);

        yield* broker.start({
          graph,
          handlers
        });
      });

    return client as T;
  });
}
