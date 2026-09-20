import { Effect, Schema } from "effect";
import type { AnyMessage, Consumer } from "signalgraph";
import { toPropertyName } from "signalgraph/internal";

import { Broker, type HandlerRegistry } from "./broker.ts";
import { InvalidPayloadError } from "./errors.ts";
import { createPublishMetadata, type MessageMetadata } from "./metadata.ts";
import { CurrentMessageMetadata } from "./references.ts";
import { validateRuntime, validateConsumers } from "./validation.ts";

export interface RuntimeMessage<P> {
  publish(payload: P): Effect.Effect<void>;
}

export type UserHandler<P> = (ctx: {
  readonly payload: P;
  readonly metadata: MessageMetadata;
}) => Effect.Effect<void>;

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
  listen(): Effect.Effect<void>;
};

export function createClient<T extends object>(graph: MessageGraph) {
  return Effect.sync(() => {
    const client: Record<string, unknown> = {};
    const handlers: HandlerRegistry = new Map();

    for (const [exportIdentifier, exportData] of Object.entries(graph)) {
      client[toPropertyName(exportIdentifier)] = {
        publish(payload: unknown) {
          return Effect.gen(function* () {
            const broker = yield* Broker;

            const encoded = yield* Schema.encodeUnknownEffect(exportData.definition.schema)(
              payload,
            );

            const metadata: MessageMetadata = yield* createPublishMetadata();

            yield* Effect.annotateCurrentSpan({
              "signalgraph.message.id": metadata.messageId,
              "signalgraph.correlation.id": metadata.correlationId,
            });

            yield* broker.deliver({
              message: exportIdentifier,
              data: {
                payload: encoded,
                metadata,
              },
            });
          }).pipe(
            Effect.withSpan("signalgraph.publish", {
              attributes: {
                "signalgraph.message.name": exportIdentifier,
              },
            }),
          );
        },
      };

      for (const consumer of exportData.consumers) {
        client[consumer.name] = {
          handle(handler: UserHandler<unknown>) {
            return Effect.sync(() => {
              const list = handlers.get(consumer.name) ?? [];

              list.push((message) =>
                Effect.gen(function* () {
                  const decoded = yield* Schema.decodeUnknownEffect(exportData.definition.schema)(
                    message.payload,
                  ).pipe(
                    Effect.mapError(
                      (cause) =>
                        new InvalidPayloadError({
                          message: "Incoming payload does not match defined message schema",
                          cause,
                        }),
                    ),
                  );

                  return yield* Effect.provideService(
                    handler({
                      payload: decoded,
                      metadata: message.metadata,
                    }),
                    CurrentMessageMetadata,
                    message.metadata,
                  ).pipe(
                    Effect.withSpan("signalgraph.handler", {
                      attributes: {
                        "signalgraph.consumer.name": consumer.name,
                        "signalgraph.message.name": consumer.message.name,
                        "signalgraph.message.id": message.metadata.messageId,
                        "signalgraph.correlation.id": message.metadata.correlationId,
                      },
                    }),
                  );
                }),
              );

              handlers.set(consumer.name, list);
            });
          },
        };
      }
    }

    client.start = () =>
      Effect.gen(function* () {
        const broker = yield* Broker;

        yield* validateRuntime(graph);
        yield* validateConsumers(graph);

        yield* broker.start({
          graph,
          handlers,
        });
      });

    client.listen = () =>
      Effect.gen(function* () {
        yield* (client as RuntimeClient).start();

        // Suspend until SIGINT/SIGTERM, then resolve normally - this is
        // what keeps the process alive without the caller ever seeing it.
        yield* Effect.callback<void>((resume) => {
          const onSignal = () => {
            process.removeListener("SIGINT", onSignal);
            process.removeListener("SIGTERM", onSignal);
            resume(Effect.void);
          };

          process.once("SIGINT", onSignal);
          process.once("SIGTERM", onSignal);

          // Runs if this Effect is interrupted from elsewhere (e.g. a
          // test wraps run() in a timeout) - avoids leaking listeners.
          return Effect.sync(() => {
            process.removeListener("SIGINT", onSignal);
            process.removeListener("SIGTERM", onSignal);
          });
        });
      });

    return client as T;
  });
}
