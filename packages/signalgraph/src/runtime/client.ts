import { Duration, Effect, Layer, Schema } from "effect";

import * as Broker from "../broker/index.ts";
import type { Consumer } from "../Consumer.ts";
import type { Integration } from "../integration/index.ts";
import { toPropertyName } from "../internal/naming.ts";
import type { AnyMessage } from "../Message.ts";
import { InvalidPayloadError } from "./errors.ts";
import * as Metadata from "./metadata.ts";
import { CurrentMessageMetadata } from "./references.ts";
import * as Validation from "./validation.ts";

export interface RuntimeMessage<P> {
  publish(payload: P): Effect.Effect<void>;
}

type UserHandler<P> = (ctx: {
  readonly payload: P;
  readonly metadata: Metadata.MessageMetadata;
}) => Effect.Effect<void, unknown>;

export interface RuntimeConsumer<P> {
  handle(handler: UserHandler<P>): Effect.Effect<void>;
}

type MessageNode = {
  definition: AnyMessage;
  consumers: ReadonlyArray<Consumer<string, AnyMessage>>;
};

export type MessageGraph = Record<string, MessageNode>;

interface ListenOptions {
  readonly integrations?: ReadonlyArray<Integration>;
  readonly gracePeriod?: Duration.Input;
}

export type RuntimeClient = {
  start(): Effect.Effect<void>;
  listen(options?: ListenOptions): Effect.Effect<void>;
};

// Resolves on the next SIGINT or SIGTERM and removes its own listeners
// (also on interruption), so it can be used once per shutdown stage.
const waitForSignal = Effect.callback<void>((resume) => {
  const onSignal = () => {
    process.removeListener("SIGINT", onSignal);
    process.removeListener("SIGTERM", onSignal);
    resume(Effect.void);
  };

  process.once("SIGINT", onSignal);
  process.once("SIGTERM", onSignal);

  return Effect.sync(() => {
    process.removeListener("SIGINT", onSignal);
    process.removeListener("SIGTERM", onSignal);
  });
});

export function createClient<T extends object>(graph: MessageGraph) {
  return Effect.sync(() => {
    const client: Record<string, unknown> = {};
    const handlers: Broker.HandlerRegistry = new Map();

    for (const [exportIdentifier, exportData] of Object.entries(graph)) {
      client[toPropertyName(exportIdentifier)] = {
        publish(payload: unknown) {
          return Effect.gen(function* () {
            const broker = yield* Broker.Broker;

            const encoded = yield* Schema.encodeUnknownEffect(exportData.definition.schema)(payload);

            const metadata: Metadata.MessageMetadata = yield* Metadata.createPublishMetadata();

            yield* Effect.annotateCurrentSpan({
              "signalgraph.message.id": metadata.messageId,
              "signalgraph.correlation.id": metadata.correlationId
            });

            yield* broker.deliver({
              message: exportIdentifier,
              data: {
                payload: encoded,
                metadata
              }
            });
          }).pipe(
            Effect.withSpan("signalgraph.publish", {
              attributes: {
                "signalgraph.message.name": exportIdentifier
              }
            })
          );
        }
      };

      for (const consumer of exportData.consumers) {
        client[consumer.name] = {
          handle(handler: UserHandler<unknown>) {
            return Effect.sync(() => {
              const list = handlers.get(consumer.name) ?? [];

              list.push((message) =>
                Effect.gen(function* () {
                  const decoded = yield* Schema.decodeUnknownEffect(exportData.definition.schema)(message.payload).pipe(
                    Effect.mapError(
                      (cause) =>
                        new InvalidPayloadError({
                          message: "Incoming payload does not match defined message schema",
                          cause
                        })
                    )
                  );

                  return yield* Effect.provideService(
                    handler({
                      payload: decoded,
                      metadata: message.metadata
                    }),
                    CurrentMessageMetadata,
                    message.metadata
                  ).pipe(
                    Effect.withSpan("signalgraph.handler", {
                      attributes: {
                        "signalgraph.consumer.name": consumer.name,
                        "signalgraph.message.name": consumer.message.name,
                        "signalgraph.message.id": message.metadata.messageId,
                        "signalgraph.correlation.id": message.metadata.correlationId
                      }
                    })
                  );
                })
              );

              handlers.set(consumer.name, list);
            });
          }
        };
      }
    }

    client.start = () =>
      Effect.gen(function* () {
        const broker = yield* Broker.Broker;

        yield* Validation.validateConsumers(graph);
        yield* Validation.validateHandlers(graph, handlers);

        yield* broker.start({
          graph,
          handlers
        });
      });

    client.listen = (options?: ListenOptions) =>
      Effect.gen(function* () {
        const broker = yield* Broker.Broker;
        const gracePeriod = options?.gracePeriod ?? "30 seconds";

        for (const integration of options?.integrations ?? []) {
          yield* Layer.build(integration);
        }

        yield* (client as RuntimeClient).start();

        yield* waitForSignal;

        const drain = Effect.gen(function* () {
          yield* Effect.logInfo("Shutdown signal received; stopping message consumers");

          yield* broker.stop.pipe(
            Effect.catchCause((cause) => Effect.logError("Failed to stop message consumers cleanly", cause))
          );

          yield* broker.awaitIdle.pipe(
            Effect.timeout(Duration.fromInputUnsafe(gracePeriod)),
            Effect.catchTag("TimeoutError", () =>
              Effect.logWarning("Shutdown grace period elapsed; closing consumers with active handlers")
            )
          );
        });

        // Registered before `stop` starts, so a second signal is caught at any point of the drain.
        const forced = waitForSignal.pipe(
          Effect.andThen(Effect.logWarning("Second shutdown signal received; forcing shutdown"))
        );

        yield* Effect.onExit(drain.pipe(Effect.race(forced)), () => broker.close);
      }).pipe(Effect.scoped);

    return client as T;
  });
}
