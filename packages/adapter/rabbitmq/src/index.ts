import { withSpanContext } from "@effect/opentelemetry/OtelTracer";
import * as amqp from "amqplib";
import { Deferred, Duration, Effect, Fiber, Layer, Predicate, Queue, Result, Schedule, Schema } from "effect";
import type { AnyConsumer, RetryPolicy } from "signalgraph";
import * as Broker from "signalgraph/broker";
import * as Runtime from "signalgraph/runtime";

type RabbitMQOptions = {
  url: string;
  /** Heartbeat interval in seconds. Detection of a dead connection takes about twice this. Default 15. */
  readonly heartbeat?: number;
  readonly reconnect?: {
    readonly initialDelay?: Duration.Input; // default 1 second
    readonly maxDelay?: Duration.Input; // default 30 seconds
    readonly factor?: number; // default 2
  };
  /** How long a publish waits for a lost connection to come back before failing. Default 30 seconds. */
  readonly publishWaitTimeout?: Duration.Input;
  /** How long one connection attempt may take before it is abandoned and retried. Default 10 seconds. */
  readonly connectTimeout?: Duration.Input;
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

// Message only: errors can carry connection details, and credentials must never be logged.
const errorMessage = (error: unknown) => (Predicate.isError(error) ? error.message : String(error));

type Delivery = { readonly msg: amqp.ConsumeMessage; readonly leave: () => void };

type Connection = Awaited<ReturnType<typeof amqp.connect>>;

type PublishFn = (
  exchange: string,
  routingKey: string,
  content: Buffer,
  options: amqp.Options.Publish
) => Effect.Effect<void, Runtime.ConnectionError>;

/** One consumer of the graph, with everything needed to (re)start it. */
type Entry = {
  readonly messageName: string;
  readonly messageDef: Runtime.MessageGraph[string];
  readonly consumer: AnyConsumer;
  readonly handlers: ReadonlyArray<Broker.BrokerHandler>;
};

type ConsumerHandle = {
  /** Idempotent. Stops new deliveries. Does nothing unless the channel is healthy. */
  readonly cancel: () => Promise<unknown>;
  /** Idempotent. Closes the channel, so the broker requeues every unacked message. */
  readonly close: () => Promise<void>;
  /** Releases the in-flight entries of this consumer only. */
  readonly release: () => void;
  readonly loop: Fiber.Fiber<unknown, unknown>;
};

/** Everything tied to one connection. Replaced as a whole when the connection dies. */
type Session = {
  readonly conn: Connection;
  readonly consumers: Map<string, ConsumerHandle>;
  /** Undefined while the publish channel is being rebuilt. */
  publisher: PublishFn | undefined;
  /** False once the connection is dead or the session is being discarded. Checked by every callback. */
  alive: boolean;
  /** True once it became the current session. A setup attempt that fails retries as a whole. */
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

export function RabbitMQBroker(options: RabbitMQOptions) {
  return Layer.effect(
    Broker.Broker,
    Effect.gen(function* () {
      const layerScope = yield* Effect.scope;

      // ---- Options. A malformed URL is the one startup error that is never retried. ----

      const parsedUrl = yield* Effect.try({
        try: () => new URL(options.url),
        // No cause and no URL in the error: both can contain credentials.
        catch: () => new Runtime.InitializationError({ cause: undefined, message: "Invalid RabbitMQ URL" })
      });

      if (parsedUrl.protocol !== "amqp:" && parsedUrl.protocol !== "amqps:") {
        return yield* new Runtime.InitializationError({
          cause: undefined,
          message: "Invalid RabbitMQ URL: expected an amqp:// or amqps:// URL"
        });
      }

      // Precedence: the option, then a heartbeat already in the URL, then 15 seconds.
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

      const maxDelay = Duration.fromInputUnsafe(options.reconnect?.maxDelay ?? "30 seconds");
      const publishWait = Duration.fromInputUnsafe(options.publishWaitTimeout ?? "30 seconds");

      // Used for the first connection, reconnects, consumer restarts and publish channel rebuilds.
      const reconnectSchedule = Schedule.exponential(
        options.reconnect?.initialDelay ?? "1 second",
        options.reconnect?.factor ?? 2
      ).pipe(
        Schedule.modifyDelay((meta) => Effect.succeed(Duration.min(meta.output, maxDelay))),
        Schedule.jittered
      );

      const connectTimeout = Duration.fromInputUnsafe(options.connectTimeout ?? "10 seconds");

      // ---- State ----

      const inFlight = Broker.makeInFlight();
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

      // Marks the session dead. Synchronous and idempotent, so it is safe to call from any
      // callback, and the first caller wins (one failure fires several events).
      const failSession = (session: Session, reason: string) => {
        if (!session.alive) return;

        session.alive = false;

        if (current === session) current = undefined;

        Queue.offerUnsafe(events, { kind: "lost", session, reason: session.errorReason ?? reason });
      };

      // ---- Publishing ----

      // Waits for a usable publish channel, which is missing while the connection or the channel
      // is being rebuilt. Polling keeps this free of waiters that could be stranded.
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

      // ---- Topology ----

      // Declares every exchange, queue, binding, retry queue and DLQ in the graph before any consumer
      // starts, so a handler that publishes during startup never hits a missing exchange or queue.
      // Uses its own channel because a rejected declaration closes the channel it was sent on,
      // and that must not be a publish channel or consumer channel. It is additive: nothing is ever deleted
      // or purged, so it is also used to restore a single consumer's queues after a failure.
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

            // A rejected declaration is reported through its promise AND as an 'error' event,
            // and an unhandled 'error' event can crash the process.
            channel.on("error", () => undefined);

            const declare = (message: string, run: () => Promise<unknown>) =>
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

      // ---- Publish channel ----

      // Opens a confirm channel and makes it the session's publisher. Used for a new session and
      // to replace a publish channel that died on its own.
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

          // Messages RabbitMQ handed back as unroutable. The `return` event arrives before the
          // confirm of the same message, so the confirm callback can check this set.
          const returned = new Set<string>();

          const publishKey = (exchange: string, routingKey: string, messageId: unknown) =>
            `${exchange}|${routingKey}|${String(messageId)}`;

          // Backpressure: publish() returned false, so new publishes wait until the channel drains.
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
                const key = publishKey(exchange, routingKey, publishOptions.messageId);

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
            returned.add(publishKey(msg.fields.exchange, msg.fields.routingKey, msg.properties.messageId));
          });
          channel.on("drain", releaseGate);
          channel.on("error", (err) => {
            errorReason = err.message;
          });
          channel.on("close", () => {
            releaseGate(); // never leave publishers waiting on a dead channel

            // Replaced already, or the whole connection is gone and its recovery covers this.
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

      // ---- Sessions ----

      // One connection attempt: connect, open the publish channel, wire the connection's events.
      // A throw from amqp.connect and a rejection are both retried; the URL was validated up front.
      const openSession = Effect.gen(function* () {
        const conn = yield* Effect.tryPromise({
          try: (signal) => {
            const attempt = amqp.connect(connectionUrl);

            // An abandoned attempt (timeout or interruption) must not leave a connection open when it arrives late.
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

        // 'error' is followed by 'close' (and a graceful server shutdown only emits 'close'),
        // so recovery hangs off 'close'. The 'error' listener only stops the process from crashing.
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

      // ---- Consumers ----

      const startConsumer = ({ session, entry }: { readonly session: Session; readonly entry: Entry }) =>
        Effect.gen(function* () {
          const { messageName, consumer, handlers: consumerHandlers } = entry;

          // "open": healthy. "failed": the broker cancelled the consumer but the channel is still open.
          // "closed": the channel is gone. Acks and nacks are skipped unless the state is "open".
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

          // The state is set before we close the channel ourselves, so our own close is not treated as a failure.
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

          // Whatever fails below must not leave this channel open.
          const closeOnError = Effect.onError(() => Effect.tryPromise(() => closeChannel()).pipe(Effect.ignore));

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

          // The broker can close a channel at any time, and ack/nack then throw synchronously.
          // The broker requeues unacked messages itself in that case, so swallowing is safe.
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
                  // RabbitMQ cancelled this consumer (for example because its queue was deleted).
                  if (state === "open") {
                    state = "failed";
                    fail("consumer was cancelled by the broker");
                  }

                  return;
                }

                // The connection is gone, or this consumer is being replaced. The broker requeues
                // whatever is still unacked.
                if (!session.alive || state !== "open") {
                  return;
                }

                if (isStopping) {
                  // Arrived after stop(): hand it straight back.
                  settleNow(() => consumerChannel.nack(msg, false, true));

                  return;
                }

                // Counted on receipt, so buffered messages are covered by awaitIdle too.
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
                      if (state !== "open") {
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
                        Effect.logError("Failed to settle failed message; returning it to the queue", settleCause).pipe(
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

              return consumerChannel.cancel(consumerTag.consumerTag);
            },
            close: closeChannel,
            release: () => {
              for (const leave of pending) leave();
            },
            loop
          };

          // stop() may have run while this consumer was starting, and it only cancels consumers that already existed.
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
        });

      // Closes a consumer's channel first, so the broker requeues its unacked messages and an
      // interrupted handler can no longer ack, then it stops its loop and releases its in-flight entries.
      const discardConsumer = (handle: ConsumerHandle) =>
        Effect.gen(function* () {
          yield* Effect.tryPromise(() => handle.close()).pipe(Effect.ignore);
          yield* Fiber.interrupt(handle.loop);
          handle.release();
        });

      // Closes the session's connection, stops its handlers and releases their in-flight entries.
      // The broker has already requeued their unacked messages, and their acks can no longer succeed,
      // so running them to completion would only produce a second run next to the redelivered one.
      // Safe to release everything: a session is only replaced while no other session is alive.
      const discardSession = (session: Session) =>
        Effect.gen(function* () {
          session.alive = false;
          yield* closeConnection(session.conn);
          yield* Effect.forEach([...session.consumers.values()], (handle) => Fiber.interrupt(handle.loop), {
            discard: true
          });
          inFlight.releaseAll();
        });

      // One complete attempt: a new session with its consumers, made current only if everything worked.
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

      // ---- Recovery ----

      const handleLost = (event: Extract<SessionEvent, { kind: "lost" }>) =>
        Effect.gen(function* () {
          // A setup attempt that died reports its own failure through connectWithRetry.
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

          // If the connection died too, the session recovery covers every consumer.
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

          // A publish to a missing exchange is the usual reason this channel died, so the topology
          // is declared again before the new channel is opened.
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

      const handleEvent = (event: SessionEvent): Effect.Effect<void, unknown> => {
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

      // ---- Startup ----

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

      // Event callbacks run outside Effect, so they only put events on a queue. This fiber handles
      // them inside the app's own Effect context, with its loggers.
      yield* Effect.forkIn(layerScope)(
        Effect.forever(
          Queue.take(events).pipe(
            Effect.flatMap(handleEvent),
            Effect.catchCause((cause) => Effect.logError("RabbitMQ connection supervisor failed", cause))
          )
        )
      );

      // ---- Broker contract ----

      const start = ({ graph, handlers }: { graph: Runtime.MessageGraph; handlers: Broker.HandlerRegistry }) =>
        Effect.gen(function* () {
          startArgs = { graph, handlers };

          // During an outage the session that comes back populates itself from startArgs.
          const session = current;

          if (session !== undefined) yield* populate(session);
        });

      const stop = Effect.gen(function* () {
        isStopping = true;

        yield* Effect.logInfo(`Stopping RabbitMQ consumers; ${inFlight.count()} messages in flight`);

        // cancel() is idempotent, so a repeated stop() is a no-op. If the session is being
        // rebuilt there is nothing to cancel, and isStopping keeps the new one from consuming.
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

        // Closing the channels first means the broker requeues every unacked message,
        // and an interrupted handler can no longer ack. A closed channel also skips any later cancel().
        const results = yield* Effect.forEach(consumers, (handle) =>
          Effect.tryPromise({
            try: () => handle.close(),
            catch: (cause) =>
              new Runtime.ConnectionError({ cause, message: "Failed to close RabbitMQ consumer channel" })
          }).pipe(Effect.result)
        );

        // Interrupts handlers that are still running (forced shutdown).
        yield* Effect.forEach(consumers, (handle) => Fiber.interrupt(handle.loop), { discard: true });

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
