import { Duration, Effect, Layer, Option, Schema } from "effect";

import * as Broker from "../broker/index.ts";
import type { AnyConsumer, Consumer } from "../Consumer.ts";
import type { Integration } from "../integration/index.ts";
import { toPropertyName } from "../internal/naming.ts";
import type { AnyMessage, Message } from "../Message.ts";
import { InvalidPayloadError, ValidationError, type ConnectionError, type InitializationError } from "./errors.ts";
import * as Metadata from "./metadata.ts";
import { CurrentMessageMetadata } from "./references.ts";
import * as Validation from "./validation.ts";

/** Publishes a payload validated by the message definition that created this resource. */
export interface RuntimeMessage<P> {
  /** Encodes and delivers the payload to the configured broker. */
  publish(payload: P): Effect.Effect<void, ConnectionError | InvalidPayloadError>;
}

type UserHandler<P, E> = (ctx: {
  readonly payload: P;
  readonly metadata: Metadata.MessageMetadata;
}) => Effect.Effect<void, E>;

/** Registers a handler for a decoded message payload. */
export interface RuntimeConsumer<P> {
  handle<E>(handler: UserHandler<P, E>): Effect.Effect<void>;
}

type MessageNode = {
  definition: AnyMessage;
  consumers: ReadonlyArray<AnyConsumer>;
};

/** Describes the message and consumer topology supplied to a runtime client. */
export type MessageGraph = Readonly<Record<string, MessageNode>>;

/** Configures process-signal handling for a running client. */
export interface ListenOptions {
  /** Layers scoped to the lifetime of the listener. Defaults to an empty list. */
  readonly integrations?: ReadonlyArray<Integration>;
  /** Maximum time to drain on the first shutdown signal. Defaults to 30 seconds. */
  readonly gracePeriod?: Duration.Input;
}

/** Common lifecycle operations available on every generated SignalGraph client. */
export type RuntimeClient = {
  start(): Effect.Effect<void, ConnectionError | InitializationError | ValidationError>;
  listen(options?: ListenOptions): Effect.Effect<void, ConnectionError | InitializationError | ValidationError>;
};

type ClientResources = {
  readonly message: <P, E>(name: string, definition: Message<string, Schema.Codec<P, E>>) => RuntimeMessage<P>;
  readonly consumer: <P, E>(definition: Consumer<string, Message<string, Schema.Codec<P, E>>>) => RuntimeConsumer<P>;
};

/** Resolves once for the next shutdown signal and always removes its process listeners. */
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

/**
 * Builds a client with the configured broker. The generated client infers payload types from the schemas.
 * The generated module binds each message and consumer to its definition.
 */
export function createClient<Resources>(graph: MessageGraph, bind: (resources: ClientResources) => Resources) {
  return Effect.gen(function* () {
    yield* Validation.validateConsumers(graph);

    const names = new Set(["start", "listen"]);

    for (const [messageName, { definition, consumers }] of Object.entries(graph)) {
      if (consumers.some((consumer) => consumer.message !== definition)) {
        return yield* new ValidationError({
          message: `Cannot create client for "${messageName}". Attach only consumers of the graph entry's message definition.`,
          area: "graph"
        });
      }

      for (const name of [messageName, ...consumers.map((consumer) => consumer.name)]) {
        const property = toPropertyName(name);

        if (names.has(property)) {
          return yield* new ValidationError({
            message: `Cannot create client because "${name}" maps to the reserved or duplicate property "${property}". Rename the message or consumer.`,
            area: "graph"
          });
        }

        names.add(property);
      }
    }

    const broker = yield* Broker.Broker;
    const handlers: Broker.HandlerRegistry = new Map();

    const client: RuntimeClient = {
      start: () =>
        Effect.gen(function* () {
          yield* Validation.validateHandlers(graph, handlers);

          yield* broker.start({
            graph,
            handlers
          });
        }),
      listen: (options?: ListenOptions) =>
        Effect.gen(function* () {
          const gracePeriod = Duration.fromInput(options?.gracePeriod ?? "30 seconds");

          if (Option.isNone(gracePeriod)) {
            return yield* new ValidationError({
              area: "listen",
              message: "Cannot listen with an invalid grace period. Set gracePeriod to a valid duration."
            });
          }

          for (const integration of options?.integrations ?? []) {
            yield* Layer.build(integration);
          }

          yield* client.start();
          yield* waitForSignal;

          const drain = Effect.gen(function* () {
            yield* Effect.logInfo("Shutdown signal received; stopping message consumers");

            yield* broker.stop.pipe(
              Effect.catchCause((cause) => Effect.logError("Failed to stop message consumers cleanly", cause))
            );

            yield* broker.awaitIdle.pipe(
              Effect.timeout(gracePeriod.value),
              Effect.catchTag("TimeoutError", () =>
                Effect.logWarning("Shutdown grace period elapsed; closing consumers with active handlers")
              )
            );
          });

          const forced = waitForSignal.pipe(
            Effect.andThen(Effect.logWarning("Second shutdown signal received; forcing shutdown"))
          );

          yield* Effect.onExit(drain.pipe(Effect.race(forced)), () => broker.close);
        }).pipe(Effect.scoped)
    };

    const bindMessage = <P, E>(name: string, definition: Message<string, Schema.Codec<P, E>>): RuntimeMessage<P> => {
      const encode = Schema.encodeEffect(definition.schema);

      return {
        publish: (payload: P) =>
          Effect.gen(function* () {
            const encoded = yield* encode(payload).pipe(
              Effect.catchTag("SchemaError", (cause) =>
                Effect.fail(
                  new InvalidPayloadError({
                    cause,
                    message: `Cannot publish "${name}". Correct the payload to match its message schema.`
                  })
                )
              )
            );

            const metadata = yield* Metadata.createPublishMetadata();

            yield* Effect.annotateCurrentSpan({
              "signalgraph.message.id": metadata.messageId,
              "signalgraph.correlation.id": metadata.correlationId
            });

            yield* broker.deliver({
              message: name,
              data: { payload: encoded, metadata }
            });
          }).pipe(
            Effect.withSpan("signalgraph.publish", {
              attributes: { "signalgraph.message.name": name }
            })
          )
      };
    };

    const bindConsumer = <P, E>(
      consumer: Consumer<string, Message<string, Schema.Codec<P, E>>>
    ): RuntimeConsumer<P> => {
      const decode = Schema.decodeUnknownEffect(consumer.message.schema);

      return {
        handle: (handler) =>
          Effect.sync(() => {
            const list = handlers.get(consumer.name) ?? [];

            list.push((message) =>
              Effect.gen(function* () {
                const decoded = yield* decode(message.payload).pipe(
                  Effect.catchTag("SchemaError", (cause) =>
                    Effect.fail(
                      new InvalidPayloadError({
                        message: `Cannot handle "${consumer.message.name}" in "${consumer.name}". Check that the publisher uses a compatible message schema.`,
                        cause
                      })
                    )
                  )
                );

                return yield* Effect.provideService(
                  handler({ payload: decoded, metadata: message.metadata }),
                  CurrentMessageMetadata,
                  Option.some(message.metadata)
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
          })
      };
    };

    return { ...bind({ message: bindMessage, consumer: bindConsumer }), ...client };
  });
}
