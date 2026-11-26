import { withSpanContext } from "@effect/opentelemetry/OtelTracer";
import * as amqp from "amqplib";
import { Deferred, Duration, Effect, Fiber, Layer, Option, Predicate, Queue, Result, Schedule, Schema } from "effect";
import type { AnyConsumer, RetryPolicy } from "signalgraph";
import * as Broker from "signalgraph/broker";
import * as Runtime from "signalgraph/runtime";

type RabbitMQOptions = {
  url: string;
  /** Heartbeat interval in seconds. Detecting a lost connection takes about two intervals. Defaults to 15. */
  readonly heartbeat?: number;
  readonly reconnect?: {
    readonly initialDelay?: Duration.Input; // default 1 second
    readonly maxDelay?: Duration.Input; // default 30 seconds
    readonly factor?: number; // default 2
  };
  /** Maximum time a publish waits for a usable publish channel. Defaults to 30 seconds. */
  readonly publishWaitTimeout?: Duration.Input;
  /** Maximum duration of one connection attempt. Defaults to 10 seconds. */
  readonly connectTimeout?: Duration.Input;
};

const RETRY_ATTEMPT_HEADER = "signalgraph-retry-attempt";
const decodeMessageId = Schema.decodeUnknownOption(Schema.String);
const decodeRetryAttempt = Schema.decodeUnknownOption(Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)));

const decodeTraceContext = Schema.decodeUnknownOption(
  Schema.Struct({
    traceId: Schema.String.check(Schema.isPattern(/^(?!0{32}$)[0-9a-f]{32}$/i)),
    spanId: Schema.String.check(Schema.isPattern(/^(?!0{16}$)[0-9a-f]{16}$/i)),
    traceFlags: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 255 })),
    isRemote: Schema.optionalKey(Schema.Boolean)
  })
);

const decodePayload = Schema.decodeEffect(Schema.fromJsonString(Schema.Unknown));
const encodePayload = Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown));

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

// Extract the message so callers can log it without attaching the original connection error.
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- Node event emitters supply untrusted error values.
const errorMessage = (error: unknown) => (Predicate.isError(error) ? error.message : String(error));

type Delivery = { readonly msg: amqp.ConsumeMessage; readonly leave: () => void };

type Connection = Awaited<ReturnType<typeof amqp.connect>>;

type PublishFn = (
  exchange: string,
  routingKey: string,
  content: Buffer,
  options: amqp.Options.Publish
) => Effect.Effect<void, Runtime.ConnectionError>;

/** The declarations needed to start or restart one consumer. */
type Entry = {
  readonly messageName: string;
  readonly messageDef: Runtime.MessageGraph[string];
  readonly consumer: AnyConsumer;
  readonly handlers: ReadonlyArray<Broker.BrokerHandler>;
};

type ConsumerHandle = {
  /** Idempotent. Stops new deliveries. Does nothing unless the channel is healthy. */
  readonly cancel: () => Promise<void>;
  /** Idempotent. Closes the channel. RabbitMQ requeues every unacknowledged message. */
  readonly close: () => Promise<void>;
  /** Releases the in-flight entries of this consumer only. */
  readonly release: () => void;
  readonly loop: Fiber.Fiber<never>;
};

/** The state for one connection. A reconnect replaces the entire session. */
type Session = {
  readonly conn: Connection;
  readonly consumers: Map<string, ConsumerHandle>;
  /** Undefined while the publish channel is being rebuilt. */
  publisher: PublishFn | undefined;
  /** Each callback checks this flag. It is false once the connection closes or the adapter discards the session. */
  alive: boolean;
  /** True once this session becomes current. A setup failure retries the entire session. */
  established: boolean;
  /** The reason from the connection's 'error' event, which arrives before its 'close'. */
  errorReason: string | undefined;
};

type SessionEvent =
  | { readonly kind: "lost"; readonly session: Session; readonly reason: string }
  | { readonly kind: "consumer-lost"; readonly session: Session; readonly entry: Entry; readonly reason: string }
  | { readonly kind: "publisher-lost"; readonly session: Session; readonly reason: string }
  | { readonly kind: "log"; readonly effect: Effect.Effect<void> };

const closeConnection = (conn: Connection) => Effect.tryPromise(() => conn.close()).pipe(Effect.ignore);

const parseTimeout = (field: string, input: Duration.Input) =>
  Effect.gen(function* () {
    const duration = Duration.fromInput(input);

    if (Option.isSome(duration) && Duration.isFinite(duration.value) && Duration.toMillis(duration.value) > 0) {
      return duration.value;
    }

    return yield* new Runtime.InitializationError({
      cause: undefined,
      message: `Cannot configure RabbitMQ. Set ${field} to a positive finite duration.`
    });
  });

/** Connects to RabbitMQ and provides scoped publishing, consumption, and reconnection. */
export function RabbitMQBroker(options: RabbitMQOptions) {
  return Layer.effect(
    Broker.Broker,
    Effect.gen(function* () {
      const layerScope = yield* Effect.scope;

      // Validate configuration before attempting a connection.

      const parsedUrl = yield* Effect.try({
        try: () => new URL(options.url),
        // The cause and URL can both contain credentials.
        catch: () => new Runtime.InitializationError({ cause: undefined, message: "Invalid RabbitMQ URL" })
      });

      if (parsedUrl.protocol !== "amqp:" && parsedUrl.protocol !== "amqps:") {
        return yield* new Runtime.InitializationError({
          cause: undefined,
          message: "Invalid RabbitMQ URL: expected an amqp:// or amqps:// URL"
        });
      }

      // Prefer the explicit heartbeat, then the URL setting, then 15 seconds.
      const urlHeartbeat = parsedUrl.searchParams.get("heartbeat");
      const heartbeat = options.heartbeat ?? (urlHeartbeat === null ? 15 : Number(urlHeartbeat));

      if (!Number.isInteger(heartbeat) || heartbeat < 1) {
        return yield* new Runtime.InitializationError({
          cause: undefined,
          message: "Invalid RabbitMQ heartbeat: expected a whole number of seconds, at least 1"
        });
      }

      parsedUrl.searchParams.set("heartbeat", String(heartbeat));
      const connectionUrl = parsedUrl.toString();
      const host = parsedUrl.host; // hostname and port, no credentials

      const maxDelay = yield* parseTimeout("reconnect.maxDelay", options.reconnect?.maxDelay ?? "30 seconds");
      const initialDelay = yield* parseTimeout("reconnect.initialDelay", options.reconnect?.initialDelay ?? "1 second");
      const publishWait = yield* parseTimeout("publishWaitTimeout", options.publishWaitTimeout ?? "30 seconds");
      const connectTimeout = yield* parseTimeout("connectTimeout", options.connectTimeout ?? "10 seconds");
      const factor = options.reconnect?.factor ?? 2;

      if (!Number.isFinite(factor) || factor < 1) {
        return yield* new Runtime.InitializationError({
          cause: undefined,
          message: "Cannot configure RabbitMQ. Set reconnect.factor to a finite number of at least 1."
        });
      }

      // Used for the first connection, reconnects, consumer restarts and publish channel rebuilds.
      const reconnectSchedule = Schedule.exponential(initialDelay, factor).pipe(
        Schedule.modifyDelay((meta) => Effect.succeed(Duration.min(meta.output, maxDelay))),
        Schedule.jittered
      );

      // State

      const inFlight = Broker.trackBrokerDeliveries();
      const events = yield* Queue.unbounded<SessionEvent>();
      let isStopping = false;
      let current: Session | undefined;
      let hasConnected = false;
      let startArgs: { graph: Runtime.MessageGraph; handlers: Broker.HandlerRegistry } | undefined;

      const notConnected = () =>
        new Runtime.ConnectionError({
          cause: undefined,
          message: "Not connected to RabbitMQ and the connection did not come back in time"
        });

      // Several events can report the same failure. Mark the session inactive before enqueuing recovery.
      const failSession = (session: Session, reason: string) => {
        if (!session.alive) return;

        session.alive = false;

        if (current === session) current = undefined;

        Queue.offerUnsafe(events, { kind: "lost", session, reason: session.errorReason ?? reason });
      };

      // Publishing

      // Poll for a usable publish channel during recovery. This avoids retaining waiters on a failed session.
      const currentPublisher = Effect.suspend(() => {
        const publisher = current?.publisher;

        return publisher !== undefined ? Effect.succeed(publisher) : Effect.fail(notConnected());
      }).pipe(
        Effect.retry(Schedule.spaced("100 millis")),
        Effect.timeout(publishWait),
        Effect.catchTag("TimeoutError", () => Effect.fail(notConnected()))
      );

      const publishConfirmed: PublishFn = (exchange, routingKey, content, publishOptions) =>
        currentPublisher.pipe(Effect.flatMap((publish) => publish(exchange, routingKey, content, publishOptions)));

      const deliver = ({ message, data }: { message: string; data: Broker.BrokerMessage }) =>
        Effect.gen(function* () {
          const json = yield* encodePayload(data.payload).pipe(
            Effect.catchTag("SchemaError", (cause) =>
              Effect.fail(
                new Runtime.InvalidPayloadError({
                  cause,
                  message: `Cannot publish "${message}" to RabbitMQ. Use a message schema that encodes its payload as JSON.`
                })
              )
            )
          );

          yield* publishConfirmed(message, "", Buffer.from(json, "utf-8"), {
            messageId: data.metadata.messageId,
            correlationId: data.metadata.correlationId,
            persistent: true,
            headers: {
              ...(Option.isSome(data.metadata.traceContext) && { traceContext: data.metadata.traceContext.value }),
              [RETRY_ATTEMPT_HEADER]: data.metadata.retryAttempt
            }
          });
        });

      // Topology

      // Declare exchanges, bindings, and queues for delivery, retry, and dead-lettering before consumers start.
      // A handler can then publish to any declared exchange. RabbitMQ closes the channel if it rejects a
      // declaration, so use a separate channel for topology changes. The adapter can restore one consumer's
      // queues with the same operation because declarations preserve existing messages and resources.
      const declareTopology = (conn: Connection, graph: Runtime.MessageGraph) =>
        Effect.scoped(
          Effect.gen(function* () {
            const channel = yield* Effect.acquireRelease(
              Effect.tryPromise({
                try: () => conn.createChannel(),
                catch: (cause) =>
                  new Runtime.InitializationError({
                    cause,
                    message: `Failed to create channel for topology setup: ${errorMessage(cause)}`
                  })
              }),
              (ch) => Effect.tryPromise(() => ch.close()).pipe(Effect.ignore)
            );

            // A rejected declaration also emits an 'error' event. An unhandled event can crash the process.
            channel.on("error", () => undefined);

            const declare = <A>(message: string, run: () => Promise<A>) =>
              Effect.tryPromise({
                try: run,
                catch: (cause) =>
                  new Runtime.InitializationError({ cause, message: `${message}: ${errorMessage(cause)}` })
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

                const retry = consumer.retry;

                if (retry !== undefined) {
                  for (let attempt = 1; attempt < retry.maxAttempts; attempt++) {
                    const queue = `${consumer.name}.retry.${attempt + 1}`;

                    yield* declare(`Failed to create retry queue "${queue}"`, () =>
                      channel.assertQueue(queue, {
                        durable: true,
                        deadLetterExchange: "",
                        deadLetterRoutingKey: consumer.name,
                        messageTtl: retryDelay(retry, attempt)
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

      // Publish channel

      // Open a confirm channel for a new session or replace a failed channel on an existing session.
      const openPublisher = (session: Session) =>
        Effect.gen(function* () {
          const channel = yield* Effect.tryPromise({
            try: () => session.conn.createConfirmChannel(),
            catch: (cause) =>
              new Runtime.ConnectionError({
                cause,
                message: `Failed to create publish channel: ${errorMessage(cause)}`
              })
          });

          // For an unroutable message, RabbitMQ emits `return` before the confirmation.
          // The confirmation callback checks this set to distinguish the two outcomes.
          const returned = new Set<string>();

          const publishKey = (exchange: string, routingKey: string, messageId: Option.Option<string>) =>
            JSON.stringify([exchange, routingKey, Option.getOrNull(messageId)]);

          // When publish() returns false, wait for the channel to drain before sending another message.
          let drained: Deferred.Deferred<void> | undefined;

          const releaseGate = () => {
            if (drained === undefined) return;

            Deferred.doneUnsafe(drained, Effect.void);
            drained = undefined;
          };

          const publish: PublishFn = (exchange, routingKey, content, publishOptions) =>
            Effect.gen(function* () {
              const gate = drained;

              if (gate !== undefined) {
                yield* Deferred.await(gate);
              }

              yield* Effect.callback<void, Runtime.ConnectionError>((resume) => {
                const key = publishKey(exchange, routingKey, Option.fromUndefinedOr(publishOptions.messageId));

                try {
                  const accepted = channel.publish(
                    exchange,
                    routingKey,
                    content,
                    { ...publishOptions, mandatory: true },
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

                  if (!accepted) drained ??= Deferred.makeUnsafe<void>();
                } catch (cause) {
                  resume(Effect.fail(new Runtime.ConnectionError({ cause, message: "Failed to publish message" })));
                }
              });
            });

          const publisher = publish;
          let errorReason: string | undefined;

          channel.on("return", (msg) => {
            returned.add(
              publishKey(msg.fields.exchange, msg.fields.routingKey, decodeMessageId(msg.properties.messageId))
            );
          });
          channel.on("drain", releaseGate);
          channel.on("error", (err) => {
            errorReason = err.message;
          });
          channel.on("close", () => {
            releaseGate(); // never leave publishers waiting on a dead channel

            // Skip recovery if the adapter replaced the channel or the connection already failed.
            if (!session.alive || session.publisher !== publisher) return;

            session.publisher = undefined;
            const reason = errorReason ?? "publish channel closed";

            if (!session.established) {
              failSession(session, reason);

              return;
            }

            Queue.offerUnsafe(events, { kind: "publisher-lost", session, reason });
          });

          session.publisher = publisher;
        });

      // Sessions

      // Connect, open the publish channel, and register connection listeners.
      // The adapter retries both synchronous throws and promise rejections from amqp.connect.
      const openSession = Effect.gen(function* () {
        const conn = yield* Effect.tryPromise({
          try: (signal) => {
            const attempt = amqp.connect(connectionUrl);

            // Close connections that open after the attempt times out or is interrupted.
            signal.addEventListener("abort", () => void attempt.then((late) => late.close()).catch(() => undefined), {
              once: true
            });

            return attempt;
          },
          catch: (cause) =>
            new Runtime.ConnectionError({
              cause,
              message: `Failed to connect to RabbitMQ broker: ${errorMessage(cause)}`
            })
        }).pipe(
          Effect.timeout(connectTimeout),
          Effect.catchTag("TimeoutError", () =>
            Effect.fail(
              new Runtime.ConnectionError({
                cause: undefined,
                message: `Timed out connecting to RabbitMQ broker after ${Duration.toMillis(connectTimeout)}ms`
              })
            )
          )
        );

        const session: Session = {
          conn,
          consumers: new Map(),
          publisher: undefined,
          alive: true,
          established: false,
          errorReason: undefined
        };

        // The 'close' event starts recovery for both connection errors and a graceful server shutdown.
        // The 'error' listener prevents Node.js from crashing on an unhandled event.
        conn.on("error", (err) => {
          session.errorReason = err.message;
        });
        conn.on("close", (err?) => failSession(session, err?.message ?? "connection closed"));
        conn.on("blocked", (reason) =>
          Queue.offerUnsafe(events, {
            kind: "log",
            effect: Effect.logWarning(`RabbitMQ blocked this connection: ${reason}`)
          })
        );
        conn.on("unblocked", () =>
          Queue.offerUnsafe(events, { kind: "log", effect: Effect.logInfo("RabbitMQ unblocked this connection") })
        );

        yield* openPublisher(session).pipe(Effect.onError(() => closeConnection(conn)));

        return session;
      });

      // Consumers

      const startConsumer = ({ session, entry }: { readonly session: Session; readonly entry: Entry }) =>
        Effect.gen(function* () {
          const { messageName, consumer, handlers: consumerHandlers } = entry;

          // In the "failed" state, RabbitMQ has cancelled the consumer and the channel is still open.
          // The adapter acknowledges or rejects deliveries only in the "open" state.
          let state: "open" | "failed" | "closed" = "open";
          let cancelled = false;
          let errorReason: string | undefined;

          const consumerChannel = yield* Effect.tryPromise({
            try: () => session.conn.createChannel(),
            catch: (cause) =>
              new Runtime.ConnectionError({
                cause,
                message: `Failed to create connection to channel for consumer "${consumer.name}": ${errorMessage(cause)}`
              })
          });

          // Set the state before closing the channel so its event handler skips recovery.
          const closeChannel = () => {
            if (state === "closed") {
              return Promise.resolve();
            }

            state = "closed";

            return consumerChannel.close();
          };

          // A consumer that fails while the session is still being set up fails the whole attempt.
          const fail = (reason: string) => {
            if (!session.alive) return;

            if (!session.established) {
              failSession(session, reason);

              return;
            }

            Queue.offerUnsafe(events, { kind: "consumer-lost", session, entry, reason });
          };

          consumerChannel.on("error", (err) => {
            errorReason = err.message;
          });
          consumerChannel.on("close", () => {
            const wasOpen = state === "open";
            state = "closed";

            if (wasOpen) fail(errorReason ?? "channel closed");
          });

          // Close the channel if consumer setup fails.
          const closeOnError = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
            Effect.onError(effect, () => Effect.tryPromise(() => closeChannel()).pipe(Effect.ignore));

          const prefetch = consumer.prefetch;

          if (prefetch !== undefined) {
            yield* Effect.tryPromise({
              try: () => consumerChannel.prefetch(prefetch),
              catch: (cause) =>
                new Runtime.InitializationError({
                  cause,
                  message: `Failed to set prefetch of ${prefetch} on channel: ${errorMessage(cause)}`
                })
            }).pipe(closeOnError);
          }

          const messages = yield* Queue.unbounded<Delivery>();
          const pending = new Set<() => void>();

          // Acknowledging or rejecting a delivery can throw if RabbitMQ closes the channel.
          // RabbitMQ requeues unacknowledged messages on that channel.
          const settleNow = (action: () => void) => {
            if (state !== "open") return;

            try {
              action();
            } catch {
              // channel already gone
            }
          };

          const settle = (action: () => void) => Effect.sync(() => settleNow(action));

          const ack = (msg: amqp.ConsumeMessage) => settle(() => consumerChannel.ack(msg));
          const requeue = (msg: amqp.ConsumeMessage) => settle(() => consumerChannel.nack(msg, false, true));
          const discard = (msg: amqp.ConsumeMessage) => settle(() => consumerChannel.nack(msg, false, false));

          // Wait for RabbitMQ to confirm the retry or dead-letter copy before acknowledging the original.
          const republish = (routingKey: string, msg: amqp.ConsumeMessage, headers: amqp.MessagePropertyHeaders = {}) =>
            publishConfirmed("", routingKey, msg.content, {
              ...msg.properties,
              persistent: true,
              headers: { ...msg.properties.headers, ...headers }
            });

          const consumerTag = yield* Effect.tryPromise({
            try: () =>
              consumerChannel.consume(consumer.name, (msg) => {
                if (!msg) {
                  // RabbitMQ cancelled this consumer (for example because its queue was deleted).
                  if (state === "open") {
                    state = "failed";
                    fail("consumer was cancelled by the broker");
                  }

                  return;
                }

                // RabbitMQ requeues unacknowledged messages when the channel closes.
                if (!session.alive || state !== "open") {
                  return;
                }

                if (isStopping) {
                  // Requeue deliveries that arrive after stop().
                  settleNow(() => consumerChannel.nack(msg, false, true));

                  return;
                }

                // Count each delivery on receipt so awaitIdle includes buffered deliveries.
                const leaveEntry = inFlight.enter();

                const leave = () => {
                  pending.delete(leave);
                  leaveEntry();
                };

                pending.add(leave);
                Queue.offerUnsafe(messages, { msg, leave });
              }),
            catch: (cause) =>
              new Runtime.InitializationError({
                cause,
                message: `Failed to start consuming ${consumer.name}: ${errorMessage(cause)}`
              })
          }).pipe(closeOnError);

          const processMessage = Effect.gen(function* () {
            const { msg, leave } = yield* Queue.take(messages);

            yield* Effect.gen(function* () {
              if (isStopping) {
                // Requeue buffered deliveries that have not started when stop() runs.
                yield* requeue(msg);

                return;
              }

              const traceContext = decodeTraceContext(msg.properties.headers?.traceContext);

              const metadata: Runtime.MessageMetadata = {
                messageId: Option.getOrElse(decodeMessageId(msg.properties.messageId), () => ""),
                correlationId: Option.getOrElse(decodeMessageId(msg.properties.correlationId), () => ""),
                retryAttempt: Option.getOrElse(
                  decodeRetryAttempt(msg.properties.headers?.[RETRY_ATTEMPT_HEADER]),
                  () => 1
                ),
                traceContext
              };

              yield* Effect.gen(function* () {
                const payload = yield* decodePayload(msg.content.toString("utf-8"));

                const dispatch = Effect.gen(function* () {
                  for (const handler of consumerHandlers) {
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
                      "signalgraph.correlation.id": metadata.correlationId,
                      "signalgraph.retry.attempt": metadata.retryAttempt
                    }
                  })
                );

                if (Option.isSome(metadata.traceContext)) {
                  yield* withSpanContext(dispatch, metadata.traceContext.value);
                } else {
                  yield* dispatch;
                }
              }).pipe(
                Effect.matchCauseEffect({
                  onSuccess: () => ack(msg),
                  onFailure: () =>
                    Effect.gen(function* () {
                      if (state !== "open") {
                        return;
                      }

                      const nextAttempt = metadata.retryAttempt + 1;

                      const delivery = {
                        message: messageName,
                        consumer: consumer.name,
                        messageId: metadata.messageId,
                        correlationId: metadata.correlationId,
                        retryAttempt: metadata.retryAttempt
                      };

                      if (consumer.retry !== undefined && nextAttempt <= consumer.retry.maxAttempts) {
                        yield* republish(`${consumer.name}.retry.${nextAttempt}`, msg, {
                          [RETRY_ATTEMPT_HEADER]: nextAttempt
                        });
                        yield* ack(msg);
                        yield* Effect.logDebug("RabbitMQ confirmed a retry copy").pipe(
                          Effect.annotateLogs({ ...delivery, nextAttempt })
                        );

                        return;
                      }

                      if (consumer.dlq === true) {
                        yield* republish(`${consumer.name}.dlq`, msg);
                        yield* ack(msg);
                        yield* Effect.logWarning("RabbitMQ confirmed a dead-letter copy after processing failed").pipe(
                          Effect.annotateLogs(delivery)
                        );

                        return;
                      }

                      yield* discard(msg);
                      yield* Effect.logWarning(
                        "RabbitMQ delivery processing failed with no retry or dead-letter route"
                      ).pipe(Effect.annotateLogs(delivery));
                    }).pipe(
                      // Requeue the original when RabbitMQ does not confirm the retry or dead-letter copy.
                      Effect.catchTag("ConnectionError", () =>
                        Effect.logError(
                          "RabbitMQ could not confirm the retry or dead-letter copy. Attempting to requeue the original."
                        ).pipe(
                          Effect.annotateLogs({
                            consumer: consumer.name,
                            messageId: metadata.messageId,
                            retryAttempt: metadata.retryAttempt
                          }),
                          Effect.andThen(Effect.sleep("1 second")),
                          Effect.andThen(requeue(msg))
                        )
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

          const handle: ConsumerHandle = {
            cancel: () => {
              if (cancelled || state !== "open") {
                return Promise.resolve();
              }

              cancelled = true;

              return consumerChannel.cancel(consumerTag.consumerTag).then(() => undefined);
            },
            close: closeChannel,
            release: () => {
              for (const leave of pending) leave();
            },
            loop
          };

          // A consumer that finishes setup after stop() must be cancelled here.
          if (isStopping) {
            yield* Effect.tryPromise(() => handle.cancel()).pipe(Effect.ignore);
          }

          return handle;
        });

      // Declares the topology and starts every consumer on `session`, if start() has been called
      // and we are not shutting down. Used by start() and by every reconnect.
      const populate = (session: Session) =>
        Effect.gen(function* () {
          const args = startArgs;

          if (args === undefined || isStopping) {
            return;
          }

          yield* declareTopology(session.conn, args.graph);

          for (const [messageName, messageDef] of Object.entries(args.graph)) {
            for (const consumer of messageDef.consumers) {
              const handlers = args.handlers.get(consumer.name);

              if (handlers === undefined) {
                return yield* new Runtime.InitializationError({
                  cause: undefined,
                  message: `Consumer "${consumer.name}" has no handler`
                });
              }

              const entry: Entry = { messageName, messageDef, consumer, handlers };

              session.consumers.set(consumer.name, yield* startConsumer({ session, entry }));
            }
          }

          yield* Effect.logInfo("RabbitMQ topology declared and consumers registered").pipe(
            Effect.annotateLogs({
              messages: Object.keys(args.graph).length,
              activeConsumers: session.consumers.size
            })
          );
        });

      // Close the channel to requeue unacknowledged deliveries before interrupting the consumer loop.
      // A handler cannot acknowledge a delivery once the channel closes.
      const discardConsumer = (handle: ConsumerHandle) =>
        Effect.gen(function* () {
          yield* Effect.tryPromise(() => handle.close()).pipe(Effect.ignore);
          yield* Fiber.interrupt(handle.loop);
          handle.release();
        });

      // Close the connection to requeue unacknowledged messages. Interrupt the old handlers so they
      // do not continue processing messages RabbitMQ can redeliver. Release all delivery entries
      // before any replacement session starts.
      const discardSession = (session: Session) =>
        Effect.gen(function* () {
          session.alive = false;
          yield* closeConnection(session.conn);
          yield* Effect.forEach([...session.consumers.values()], (handle) => Fiber.interrupt(handle.loop), {
            discard: true
          });
          inFlight.releaseAll();
        });

      // Check that the session is active after starting any registered consumers.
      const establish = Effect.gen(function* () {
        const session = yield* openSession;

        yield* populate(session).pipe(
          Effect.andThen(
            Effect.suspend(() =>
              session.alive
                ? Effect.void
                : Effect.fail(
                    new Runtime.ConnectionError({ cause: undefined, message: "Connection was lost while setting up" })
                  )
            )
          ),
          Effect.onError(() => discardSession(session))
        );

        session.established = true;
        current = session;

        yield* Effect.logInfo(`${hasConnected ? "Reconnected" : "Connected"} to RabbitMQ at ${host}`);
        hasConnected = true;

        return session;
      });

      // Retries forever. Every failure is logged with its reason and never with the URL.
      // Used for the first connection too, so the process keeps trying (and logging) until
      // the broker is reachable or the process is interrupted.
      const connectWithRetry = establish.pipe(
        Effect.tapError((error) => Effect.logError(`RabbitMQ at ${host}: ${errorMessage(error)}; retrying`)),
        Effect.retry(reconnectSchedule)
      );

      // Recovery

      const handleLost = (event: Extract<SessionEvent, { kind: "lost" }>) =>
        Effect.gen(function* () {
          // connectWithRetry handles failures that occur during session setup.
          if (!event.session.established) {
            return;
          }

          yield* Effect.logWarning(`RabbitMQ connection lost (${event.reason}); rebuilding it`);
          yield* discardSession(event.session);
          yield* connectWithRetry;
        });

      const handleConsumerLost = (event: Extract<SessionEvent, { kind: "consumer-lost" }>) =>
        Effect.gen(function* () {
          const { session, entry } = event;
          const name = entry.consumer.name;

          // Rebuilding the session already restarts every consumer.
          if (!session.alive || isStopping) {
            return;
          }

          yield* Effect.logWarning(`RabbitMQ consumer "${name}" lost (${event.reason}); restarting it`);

          const old = session.consumers.get(name);
          session.consumers.delete(name);

          if (old !== undefined) yield* discardConsumer(old);

          // Only this consumer's own exchange, queues and bindings are declared again.
          const restart = Effect.gen(function* () {
            yield* declareTopology(session.conn, {
              [entry.messageName]: { ...entry.messageDef, consumers: [entry.consumer] }
            });

            session.consumers.set(name, yield* startConsumer({ session, entry }));
          });

          yield* restart.pipe(
            Effect.tapError((error) => Effect.logError(`Failed to restart consumer "${name}": ${errorMessage(error)}`)),
            Effect.retry({ schedule: reconnectSchedule, while: () => session.alive && !isStopping }),
            Effect.ignore
          );
        });

      const handlePublisherLost = (event: Extract<SessionEvent, { kind: "publisher-lost" }>) =>
        Effect.gen(function* () {
          const { session } = event;

          if (!session.alive) {
            return;
          }

          yield* Effect.logWarning(`RabbitMQ publish channel lost (${event.reason}); restarting it`);

          // Publishing to a missing exchange closes the channel. Redeclare the topology before opening its replacement.
          const rebuild = Effect.gen(function* () {
            if (startArgs !== undefined) yield* declareTopology(session.conn, startArgs.graph);
            yield* openPublisher(session);
          });

          yield* rebuild.pipe(
            Effect.tapError((error) =>
              Effect.logError(`Failed to restart the publish channel: ${errorMessage(error)}`)
            ),
            Effect.retry({ schedule: reconnectSchedule, while: () => session.alive }),
            Effect.ignore
          );
        });

      const handleEvent = (event: SessionEvent) => {
        switch (event.kind) {
          case "lost":
            return handleLost(event);
          case "consumer-lost":
            return handleConsumerLost(event);
          case "publisher-lost":
            return handlePublisherLost(event);
          case "log":
            return event.effect;
        }
      };

      // Startup

      // Registered first, so on shutdown it runs last: the supervisor and consumer loops are
      // interrupted before the connection closes, and retry publishes still have a channel while draining.
      yield* Effect.addFinalizer(() =>
        Effect.suspend(() => {
          const session = current;
          current = undefined;

          if (session === undefined) return Effect.void;

          session.alive = false;

          return closeConnection(session.conn);
        })
      );

      yield* connectWithRetry;

      // Node.js callbacks enqueue events. The supervisor handles them with the application's Effect context and loggers.
      yield* Effect.forkIn(layerScope)(
        Effect.forever(
          Queue.take(events).pipe(
            Effect.flatMap(handleEvent),
            Effect.catchCause((cause) => Effect.logError("RabbitMQ connection supervisor failed", cause))
          )
        )
      );

      // Broker contract

      const start = ({ graph, handlers }: { graph: Runtime.MessageGraph; handlers: Broker.HandlerRegistry }) =>
        Effect.gen(function* () {
          startArgs = { graph, handlers };

          // Recovery reads startArgs to start consumers after reconnecting.
          const session = current;

          if (session !== undefined) yield* populate(session);
        });

      const stop = Effect.gen(function* () {
        isStopping = true;

        yield* Effect.logInfo(`Stopping RabbitMQ consumers; ${inFlight.count()} messages in flight`);

        // Cancelling a consumer twice has no effect. The isStopping flag also prevents a
        // replacement session from starting consumers.
        yield* Effect.forEach(
          [...(current?.consumers.values() ?? [])],
          (handle) =>
            Effect.tryPromise({
              try: () => handle.cancel(),
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

        const consumers = [...(current?.consumers.values() ?? [])];

        // Close the channels first so RabbitMQ requeues unacknowledged messages. A handler
        // cannot acknowledge a delivery after its channel closes.
        const results = yield* Effect.forEach(consumers, (handle) =>
          Effect.tryPromise({
            try: () => handle.close(),
            catch: (cause) =>
              new Runtime.ConnectionError({ cause, message: "Failed to close RabbitMQ consumer channel" })
          }).pipe(Effect.result)
        );

        // Interrupt any handlers still running at shutdown.
        yield* Effect.forEach(consumers, (handle) => Fiber.interrupt(handle.loop), { discard: true });

        // Closing the channel returned the remaining deliveries to RabbitMQ.
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
