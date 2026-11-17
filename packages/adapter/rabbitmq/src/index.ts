import { withSpanContext } from "@effect/opentelemetry/OtelTracer";
import * as amqp from "amqplib";
import { Duration, Effect, Fiber, Layer, Queue, Result, Schema, Scope } from "effect";
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

type Delivery = { readonly msg: amqp.ConsumeMessage; readonly leave: () => void };

export function RabbitMQBroker(options: RabbitMQOptions) {
  return Layer.effect(
    Broker.Broker,
    Effect.gen(function* () {
      const { url } = options;

      const layerScope = yield* Effect.scope;

      const inFlight = Broker.makeInFlight();
      let isStopping = false;
      const cancelConsumers: Array<() => Promise<amqp.Replies.Empty>> = [];
      const closeConsumerChannels: Array<() => Promise<void>> = [];
      const consumerLoops: Array<Fiber.Fiber<unknown, unknown>> = [];

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

              let consumerChannelClosed = false;

              const closeConsumerChannel = (channel: amqp.Channel) => {
                if (consumerChannelClosed) {
                  return Promise.resolve();
                }

                consumerChannelClosed = true;
                return channel.close();
              };

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
                  (channel) => Effect.promise(() => closeConsumerChannel(channel))
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

              const messages = yield* Queue.unbounded<Delivery>();

              const consumerTag = yield* Effect.tryPromise({
                try: () =>
                  consumerChannel.consume(consumer.name, (msg) => {
                    if (!msg) {
                      return;
                    }

                    if (isStopping) {
                      // Arrived after stop(): hand it straight back.
                      if (!consumerChannelClosed) {
                        consumerChannel.nack(msg, false, true);
                      }
                      return;
                    }

                    // Counted on receipt, so buffered messages are covered by awaitIdle too.
                    Queue.offerUnsafe(messages, { msg, leave: inFlight.enter() });
                  }),
                catch: (cause) =>
                  new Runtime.InitializationError({
                    cause,
                    message: `Failed to start consuming ${consumer.name}`
                  })
              });

              cancelConsumers.push(() => consumerChannel.cancel(consumerTag.consumerTag));
              closeConsumerChannels.push(() => closeConsumerChannel(consumerChannel));

              const processMessage = Effect.gen(function* () {
                const { msg, leave } = yield* Queue.take(messages);

                yield* Effect.gen(function* () {
                  if (isStopping) {
                    // Received before stop() but never started: return it instead of handling it.
                    if (!consumerChannelClosed) {
                      consumerChannel.nack(msg, false, true);
                    }
                    return;
                  }

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
                      onSuccess: () =>
                        Effect.sync(() => {
                          if (!consumerChannelClosed) {
                            consumerChannel.ack(msg);
                          }
                        }),
                      onFailure: () =>
                        Effect.gen(function* () {
                          if (consumerChannelClosed) {
                            return;
                          }

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

                            if (!consumerChannelClosed) {
                              consumerChannel.ack(msg);
                            }

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

                            if (!consumerChannelClosed) {
                              consumerChannel.ack(msg);
                            }

                            return;
                          }

                          if (!consumerChannelClosed) {
                            consumerChannel.nack(msg, false, false);
                          }
                        })
                    })
                  );
                }).pipe(Effect.ensuring(Effect.sync(leave)));
              });

              const loop = yield* Effect.forkIn(layerScope)(
                Effect.forever(processMessage).pipe(
                  Effect.catchCause((cause) =>
                    isStopping ? Effect.void : Effect.logError("RabbitMQ consumer processing loop stopped", cause)
                  )
                )
              );
              consumerLoops.push(loop);
            }
          }
        });

      const stop = Effect.gen(function* () {
        isStopping = true;

        yield* Effect.logInfo(`Stopping RabbitMQ consumers; ${inFlight.count()} messages in flight`);

        // splice(0) takes and clears the list, so a repeated stop() is a no-op.
        yield* Effect.forEach(
          cancelConsumers.splice(0),
          (cancel) =>
            Effect.tryPromise({
              try: cancel,
              catch: (cause) =>
                new Runtime.ConnectionError({
                  cause,
                  message: "Failed to cancel RabbitMQ consumer"
                })
            }),
          { discard: true }
        );
      });

      const close = Effect.gen(function* () {
        isStopping = true;

        // Closing the channels first means the broker requeues every unacked message,
        // and an interrupted handler can no longer ack.
        const results = yield* Effect.forEach(closeConsumerChannels.splice(0), (closeChannel) =>
          Effect.tryPromise({
            try: closeChannel,
            catch: (cause) =>
              new Runtime.ConnectionError({ cause, message: "Failed to close RabbitMQ consumer channel" })
          }).pipe(Effect.result)
        );

        // Interrupts handlers that are still running (forced shutdown).
        yield* Effect.forEach(consumerLoops.splice(0), Fiber.interrupt, { discard: true });

        // Whatever is left was handed back to the broker by the channel close.
        inFlight.releaseAll();

        const firstFailure = results.find((result) => Result.isFailure(result));

        if (firstFailure !== undefined) {
          return yield* Effect.fail(firstFailure.failure);
        }
      });

      return {
        deliver,
        start,
        stop,
        awaitIdle: inFlight.awaitIdle,
        close
      };
    })
  );
}
