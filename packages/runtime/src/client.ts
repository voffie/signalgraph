import { Effect, Schema } from "effect";
import {
  Broker,
  type HandlerRegistry,
} from "./broker.ts";
import { InvalidPayloadError } from "./errors.ts";
import type { AnyMessage, Consumer } from "signalgraph";
import { toPropertyName } from "signalgraph/internal";
import { validateRuntime, validateConsumers } from "./validation.ts";

export interface RuntimeMessage<P> {
  publish(payload: P): Effect.Effect<void>;
}

export type UserHandler<P> = (
  ctx: {
    readonly payload: P;
  }
) => Effect.Effect<void>;

export interface RuntimeConsumer<P> {
  handle(handler: UserHandler<P>): Effect.Effect<void>;
}

type MessageNode = {
  definition: AnyMessage;
  consumers: ReadonlyArray<Consumer<string, AnyMessage>>;
};

export type MessageGraph = Record<string, MessageNode>;

export type RuntimeClient = {
  start(): Effect.Effect<void>;
};

export function createClient<T extends object>(
  graph: MessageGraph
) {
  return Effect.sync(() => {
    const client: Record<string, unknown> = {};
    const handlers: HandlerRegistry = new Map();

    for (const [exportIdentifier, exportData] of Object.entries(graph)) {
      client[toPropertyName(exportIdentifier)] = {
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
        client[consumer.name] = {
          handle(handler: UserHandler<unknown>) {
            return Effect.sync(() => {
              const list = handlers.get(consumer.name) ?? [];

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

              handlers.set(consumer.name, list);
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
