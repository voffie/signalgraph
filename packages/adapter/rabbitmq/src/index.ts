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

      // Messages RabbitMQ handed back as unroutable. The `return` event always arrives before the
      // confirm of the same message, so the confirm callback can check this set.
      const returned = new Set<string>();
      const publishKey = (exchange: string, routingKey: string, messageId: unknown) =>
        `${exchange}|${routingKey}|${String(messageId)}`;

      publishChannel.on("return", (msg) => {
        returned.add(publishKey(msg.fields.exchange, msg.fields.routingKey, msg.properties.messageId));
      });

      // Backpressure: publish() returned false, so new publishes wait until the channel drains.
      let gate: Promise<void> | undefined;
      let openGate: (() => void) | undefined;

      const closeGate = () => {
        if (gate !== undefined) return;
        gate = new Promise<void>((resolve) => {
          openGate = resolve;
        });
      };

      const releaseGate = () => {
        openGate?.();
        openGate = undefined;
        gate = undefined;
      };

      publishChannel.on("drain", releaseGate);
      publishChannel.on("close", releaseGate); // never leave publishers waiting on a dead channel

      const publishConfirmed = (exchange: string, routingKey: string, content: Buffer, options: amqp.Options.Publish) =>
        Effect.gen(function* () {
          const pending = gate;
          if (pending !== undefined) {
            yield* Effect.promise(() => pending);
          }

          yield* Effect.callback<void, Runtime.ConnectionError>((resume) => {
            const key = publishKey(exchange, routingKey, options.messageId);

            try {
              const accepted = publishChannel.publish(
                exchange,
                routingKey,
                content,
                { ...options, mandatory: true },
                (err) => {
                  if (err) {
                    returned.delete(key);
                    resume(
                      Effect.fail(
                        new Runtime.ConnectionError({ cause: err, message: "Failed to confirm published message" })
                      )
                    );
                    return;
                  }

                  if (returned.delete(key)) {
                    resume(
                      Effect.fail(
                        new Runtime.ConnectionError({
                          cause: undefined,
                          message: `Message was not routed to any queue (exchange "${exchange}", routing key "${routingKey}")`
                        })
                      )
                    );
                    return;
                  }

                  resume(Effect.void);
                }
              );

              if (!accepted) closeGate();
            } catch (cause) {
              resume(Effect.fail(new Runtime.ConnectionError({ cause, message: "Failed to publish message" })));
            }
          });
        });

      const deliver = ({ message, data }: { message: string; data: Broker.BrokerMessage }) =>
        Effect.gen(function* () {
          const json = yield* Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown))(data.payload);

          yield* publishConfirmed(message, "", Buffer.from(json, "utf-8"), {
            messageId: data.metadata.messageId,
            correlationId: data.metadata.correlationId,
            persistent: true,
            headers: {
              traceContext: data.metadata.traceContext,
              [RETRY_ATTEMPT_HEADER]: data.metadata.retryAttempt
            }
          });
        });

      // Declares every exchange, queue, binding, retry queue and DLQ in the graph before any consumer
      // starts, so a handler that publishes during startup never hits a missing exchange or queue.
      // Uses its own channel because a rejected declaration closes the channel it was sent on,
      // and that must not be the publish channel.
      const declareTopology = (graph: Runtime.MessageGraph) =>
        Effect.scoped(
          Effect.gen(function* () {
            const channel = yield* Effect.acquireRelease(
              Effect.tryPromise({
                try: () => conn.createChannel(),
                catch: (cause) =>
                  new Runtime.InitializationError({ cause, message: "Failed to create channel for topology setup" })
              }),
              (ch) => Effect.promise(() => ch.close().catch(() => undefined))
            );

            const declare = (message: string, run: () => Promise<unknown>) =>
              Effect.tryPromise({
                try: run,
                catch: (cause) => new Runtime.InitializationError({ cause, message })
              });

            for (const [messageName, messageDef] of Object.entries(graph)) {
              yield* declare(`Failed to create exchange for ${messageName}`, () =>
                channel.assertExchange(messageName, "fanout", { durable: true })
              );

              for (const consumer of messageDef.consumers) {
                yield* declare(`Failed to create queue for ${consumer.name}`, () =>
                  channel.assertQueue(consumer.name, { durable: true })
                );

                yield* declare(`Failed to bind queue ${consumer.name} to exchange ${messageName}`, () =>
                  channel.bindQueue(consumer.name, messageName, "")
                );

                if (consumer.retry !== undefined) {
                  for (let attempt = 1; attempt < consumer.retry.maxAttempts; attempt++) {
                    const queue = `${consumer.name}.retry.${attempt + 1}`;

                    yield* declare(`Failed to create retry queue "${queue}"`, () =>
                      channel.assertQueue(queue, {
                        durable: true,
                        deadLetterExchange: "",
                        deadLetterRoutingKey: consumer.name,
                        messageTtl: retryDelay(consumer.retry!, attempt)
                      })
                    );
                  }
                }

                if (consumer.dlq === true) {
                  yield* declare(`Failed to create DLQ "${consumer.name}.dlq"`, () =>
                    channel.assertQueue(`${consumer.name}.dlq`, { durable: true })
                  );
                }
              }
            }
          })
        );

      const start = ({ graph, handlers }: { graph: Runtime.MessageGraph; handlers: Broker.HandlerRegistry }) =>
        Effect.gen(function* () {
          yield* declareTopology(graph);

          for (const [messageName, messageDef] of Object.entries(graph)) {
            for (const consumer of messageDef.consumers) {
              const consumerHandlers = handlers.get(consumer.name);

              if (!consumerHandlers?.length) {
                return yield* new Runtime.InitializationError({
                  cause: undefined,
                  message: `Consumer "${consumer.name}" has no handler`
                });
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

              const messages = yield* Queue.unbounded<Delivery>();

              // The broker can close a channel at any time, and ack/nack then throw synchronously.
              // The broker requeues unacked messages itself in that case, so swallowing is safe.
              const settle = (action: () => void) =>
                Effect.sync(() => {
                  if (consumerChannelClosed) return;
                  try {
                    action();
                  } catch {
                    // channel already gone
                  }
                });

              const ack = (msg: amqp.ConsumeMessage) => settle(() => consumerChannel.ack(msg));
              const requeue = (msg: amqp.ConsumeMessage) => settle(() => consumerChannel.nack(msg, false, true));
              const discard = (msg: amqp.ConsumeMessage) => settle(() => consumerChannel.nack(msg, false, false));

              // Retry and DLQ settle the same way: confirmed copy first, ack of the original after.
              const republish = (routingKey: string, msg: amqp.ConsumeMessage, headers: Record<string, unknown> = {}) =>
                publishConfirmed("", routingKey, msg.content, {
                  ...msg.properties,
                  persistent: true,
                  headers: { ...msg.properties.headers, ...headers }
                });

              const consumerTag = yield* Effect.tryPromise({
                try: () =>
                  consumerChannel.consume(consumer.name, (msg) => {
                    if (!msg) {
                      return;
                    }

                    if (isStopping) {
                      // Arrived after stop(): hand it straight back.
                      Effect.runFork(requeue(msg));
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
                    yield* requeue(msg);
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
                    Effect.matchCauseEffect({
                      onSuccess: () => ack(msg),
                      onFailure: () =>
                        Effect.gen(function* () {
                          if (consumerChannelClosed) {
                            return;
                          }

                          const nextAttempt = metadata.retryAttempt + 1;

                          if (consumer.retry !== undefined && nextAttempt <= consumer.retry.maxAttempts) {
                            yield* republish(`${consumer.name}.retry.${nextAttempt}`, msg, {
                              [RETRY_ATTEMPT_HEADER]: nextAttempt
                            });
                            yield* ack(msg);
                            return;
                          }

                          if (consumer.dlq === true) {
                            yield* republish(`${consumer.name}.dlq`, msg);
                            yield* ack(msg);
                            return;
                          }

                          yield* discard(msg);
                        }).pipe(
                          // The retry/DLQ copy could not be confirmed, so keep the original: put it back.
                          Effect.catchCause((settleCause) =>
                            Effect.logError(
                              "Failed to settle failed message; returning it to the queue",
                              settleCause
                            ).pipe(Effect.andThen(Effect.sleep("1 second")), Effect.andThen(requeue(msg)))
                          )
                        )
                    })
                  );
                }).pipe(Effect.ensuring(Effect.sync(leave)));
              });

              const loop = yield* Effect.forkIn(layerScope)(
                Effect.forever(
                  processMessage.pipe(
                    Effect.catchCause((cause) =>
                      isStopping ? Effect.void : Effect.logError("RabbitMQ message processing failed", cause)
                    )
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
        cancelConsumers.length = 0; // closing the channels cancels the consumers anyway

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
