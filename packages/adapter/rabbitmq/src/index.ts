import { withSpanContext } from "@effect/opentelemetry/OtelTracer";
import * as amqp from "amqplib";
import { Duration, Effect, Layer, Queue, Schema, Scope } from "effect";
import type { RetryPolicy } from "signalgraph";
import * as Broker from "signalgraph/broker";
import * as Runtime from "signalgraph/runtime";

type RabbitMQOptions = {
  url: string;
};

const RETRY_ATTEMPT_HEADER = "signalgraph-retry-attempt";

function retryDelay(policy: RetryPolicy, attempt: number) {
  switch (policy.type) {
    case "fixed":
      return Math.round(Duration.toMillis(policy.delay));

    case "exponential":
      const delay = Math.round(Duration.toMillis(policy.initialDelay)) * Math.pow(policy.factor ?? 2, attempt - 1);

      if (policy.maxDelay === undefined) {
        return delay;
      } else {
        return Math.min(delay, Math.round(Duration.toMillis(policy.maxDelay)));
      }
  }
}

export function RabbitMQBroker(options: RabbitMQOptions) {
  return Layer.effect(
    Broker.Broker,
    Effect.gen(function* () {
      const { url } = options;

      const layerScope = yield* Effect.scope;

      const conn = yield* Effect.acquireRelease(
        Effect.tryPromise({
          try: () => amqp.connect(url),
          catch: (cause) =>
            new Runtime.ConnectionError({
              cause,
              message: "Failed to create connection to RabbitMQ broker"
            })
        }),
        (connection) => Effect.promise(() => connection.close())
      ).pipe(
        Effect.tap((connection) =>
          Effect.sync(() => {
            connection.on("close", () => console.log("RabbitMQ connection closed"));
          })
        )
      );

      const publishChannel = yield* Effect.acquireRelease(
        Effect.tryPromise({
          try: () => conn.createConfirmChannel(),
          catch: (cause) =>
            new Runtime.ConnectionError({
              cause,
              message: "Failed to create connection to channel"
            })
        }),
        (connection) => Effect.promise(() => connection.close())
      ).pipe(
        Effect.tap((connection) =>
          Effect.sync(() => {
            connection.on("close", () => console.log("RabbitMQ publish channel connection closed"));
          })
        )
      );

      const deliver = ({ message, data }: { message: string; data: Broker.BrokerMessage }) =>
        Effect.gen(function* () {
          const json = yield* Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown))(data.payload);

          yield* Effect.sync(() =>
            publishChannel.publish(message, "", Buffer.from(json, "utf-8"), {
              messageId: data.metadata.messageId,
              correlationId: data.metadata.correlationId,
              persistent: true,
              headers: {
                traceContext: data.metadata.traceContext,
                [RETRY_ATTEMPT_HEADER]: data.metadata.retryAttempt
              }
            })
          );

          yield* Effect.tryPromise({
            try: () => publishChannel.waitForConfirms(),
            catch: (cause) =>
              new Runtime.ConnectionError({
                cause,
                message: "Failed to confirm published message"
              })
          });
        });

      const start = ({ graph, handlers }: { graph: Runtime.MessageGraph; handlers: Broker.HandlerRegistry }) =>
        Effect.gen(function* () {
          for (const [messageName, messageDef] of Object.entries(graph)) {
            yield* Effect.tryPromise({
              try: () =>
                publishChannel.assertExchange(messageName, "fanout", {
                  durable: true
                }),
              catch: (cause) =>
                new Runtime.InitializationError({
                  cause,
                  message: `Failed to create exchange for ${messageName}`
                })
            });

            for (const consumer of messageDef.consumers) {
              const consumerHandlers = handlers.get(consumer.name);

              if (!consumerHandlers?.length) {
                continue;
              }

              // Pin this channel's release to the broker's scope,
              // not to whatever scope surrounds this call to start().
              const consumerChannel = yield* Scope.provide(layerScope)(
                Effect.acquireRelease(
                  Effect.tryPromise({
                    try: () => conn.createChannel(),
                    catch: (cause) =>
                      new Runtime.ConnectionError({
                        cause,
                        message: `Failed to create connection to channel for consumer "${consumer.name}"`
                      })
                  }),
                  (connection) => Effect.promise(() => connection.close())
                )
              );

              const prefetch = consumer.prefetch;
              if (prefetch !== undefined) {
                yield* Effect.tryPromise({
                  try: () => consumerChannel.prefetch(prefetch),
                  catch: (cause) =>
                    new Runtime.InitializationError({
                      cause,
                      message: `Failed to set prefetch of ${prefetch} on channel`
                    })
                });
              }

              yield* Effect.tryPromise({
                try: () =>
                  consumerChannel.assertQueue(consumer.name, {
                    durable: true
                  }),
                catch: (cause) =>
                  new Runtime.InitializationError({
                    cause,
                    message: `Failed to create queue for ${consumer.name}`
                  })
              });

              yield* Effect.tryPromise({
                try: () => consumerChannel.bindQueue(consumer.name, messageName, ""),
                catch: (cause) =>
                  new Runtime.InitializationError({
                    cause,
                    message: `Failed to bind queue ${consumer.name} to exchange ${messageName}`
                  })
              });

              if (consumer.retry !== undefined) {
                for (let attempt = 1; attempt < consumer.retry.maxAttempts; attempt++) {
                  const delay = retryDelay(consumer.retry, attempt);

                  const queue = `${consumer.name}.retry.${attempt + 1}`;

                  yield* Effect.tryPromise({
                    try: () =>
                      consumerChannel.assertQueue(queue, {
                        durable: true,
                        deadLetterExchange: "",
                        deadLetterRoutingKey: consumer.name,
                        messageTtl: delay
                      }),
                    catch: (cause) =>
                      new Runtime.InitializationError({
                        cause,
                        message: `Failed to create retry queue "${queue}"`
                      })
                  });
                }
              }

              if (consumer.dlq === true) {
                yield* Effect.tryPromise({
                  try: () =>
                    consumerChannel.assertQueue(`${consumer.name}.dlq`, {
                      durable: true
                    }),
                  catch: (cause) =>
                    new Runtime.InitializationError({
                      cause,
                      message: `Failed to create DLQ "${consumer.name}.dlq"`
                    })
                });
              }

              const messages = yield* Queue.unbounded<amqp.ConsumeMessage>();

              yield* Effect.tryPromise({
                try: () =>
                  consumerChannel.consume(consumer.name, (msg) => {
                    if (msg) {
                      Queue.offerUnsafe(messages, msg);
                    }
                  }),
                catch: (cause) =>
                  new Runtime.InitializationError({
                    cause,
                    message: `Failed to start consuming ${consumer.name}`
                  })
              });

              const processMessage = Effect.gen(function* () {
                const msg = yield* Queue.take(messages);

                const metadata = Runtime.createConsumeMetadata({
                  messageId: msg.properties.messageId ?? "",
                  correlationId: msg.properties.correlationId ?? "",
                  retryAttempt: msg.properties.headers?.[RETRY_ATTEMPT_HEADER],
                  traceContext: msg.properties.headers?.traceContext
                });

                yield* Effect.gen(function* () {
                  const payload = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(Schema.Unknown))(
                    msg.content.toString("utf-8")
                  );

                  const list = consumerHandlers;

                  const dispatch = Effect.gen(function* () {
                    for (const handler of list) {
                      yield* handler({
                        payload,
                        metadata
                      });
                    }
                  }).pipe(
                    Effect.withSpan("signalgraph.consume", {
                      attributes: {
                        "signalgraph.message.name": messageName,
                        "signalgraph.consumer.name": consumer.name,
                        "signalgraph.message.id": metadata.messageId,
                        "signalgraph.correlation.id": metadata.correlationId
                      }
                    })
                  );

                  if (metadata.traceContext) {
                    yield* withSpanContext(dispatch, metadata.traceContext);
                  } else {
                    yield* dispatch;
                  }
                }).pipe(
                  Effect.matchEffect({
                    onSuccess: () => {
                      consumerChannel.ack(msg);
                      return Effect.void;
                    },
                    onFailure: () =>
                      Effect.gen(function* () {
                        const nextAttempt = metadata.retryAttempt + 1;

                        if (consumer.retry !== undefined && nextAttempt <= consumer.retry.maxAttempts) {
                          yield* Effect.sync(() =>
                            publishChannel.publish("", `${consumer.name}.retry.${nextAttempt}`, msg.content, {
                              ...msg.properties,
                              persistent: true,
                              headers: {
                                ...msg.properties.headers,
                                [RETRY_ATTEMPT_HEADER]: nextAttempt
                              }
                            })
                          );

                          yield* Effect.tryPromise({
                            try: () => publishChannel.waitForConfirms(),
                            catch: (confirmCause) =>
                              new Runtime.ConnectionError({
                                cause: confirmCause,
                                message: "Failed to confirm published message"
                              })
                          });

                          consumerChannel.ack(msg);

                          return;
                        }

                        if (consumer.dlq === true) {
                          yield* Effect.sync(() =>
                            publishChannel.publish("", `${consumer.name}.dlq`, msg.content, {
                              ...msg.properties,
                              persistent: true
                            })
                          );

                          yield* Effect.tryPromise({
                            try: () => publishChannel.waitForConfirms(),
                            catch: (confirmCause) =>
                              new Runtime.ConnectionError({
                                cause: confirmCause,
                                message: "Failed to confirm published message"
                              })
                          });

                          consumerChannel.ack(msg);

                          return;
                        }

                        consumerChannel.nack(msg, false, false);
                      })
                  })
                );
              });

              // Fork into the broker's own scope so this loop outlives
              // the start() call itself.
              yield* Effect.forkIn(layerScope)(Effect.forever(processMessage).pipe(Effect.catchCause(Effect.logError)));
            }
          }
        });

      return {
        deliver,
        start
      };
    })
  );
}
