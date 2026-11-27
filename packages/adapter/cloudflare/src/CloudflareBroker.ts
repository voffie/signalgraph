import type { MessageBatch, Queue } from "@cloudflare/workers-types";
import { withSpanContext } from "@effect/opentelemetry/OtelTracer";
import { type Cause, Effect, Fiber, FiberSet, Layer, Option, Predicate, Result, Schema } from "effect";
import { Broker, type HandlerRegistry } from "signalgraph/broker";
import { ConnectionError, InitializationError, InvalidPayloadError, type MessageGraph } from "signalgraph/runtime";

import { deriveCloudflareQueueTopology, type CloudflareQueueBindingName } from "./topology.ts";

/** Queue bindings and physical queue names supplied by Cloudflare through Worker env. */
export interface CloudflareQueueBindings {
  readonly [binding: CloudflareQueueBindingName]: Queue | string | undefined;
}

const envelope = Schema.fromJsonString(
  Schema.Struct({
    payload: Schema.Json,
    messageId: Schema.NonEmptyString,
    correlationId: Schema.NonEmptyString,
    traceContext: Schema.OptionFromNullOr(
      Schema.Struct({
        traceId: Schema.String,
        spanId: Schema.String,
        traceFlags: Schema.Number
      })
    )
  })
);

const makeCloudflareBroker = Effect.fn(function* (
  graph: MessageGraph,
  env: CloudflareQueueBindings,
  pendingBatch: Option.Option<MessageBatch>
) {
  const topology = yield* deriveCloudflareQueueTopology(graph);

  const destinations = yield* Effect.forEach(topology, (entry) =>
    Effect.gen(function* () {
      const sender = Option.fromUndefinedOr(env[entry.binding]);
      const queueName = Option.fromUndefinedOr(env[entry.nameBinding]);

      if (
        Option.isNone(sender) ||
        Predicate.isString(sender.value) ||
        Option.isNone(queueName) ||
        !Predicate.isString(queueName.value)
      ) {
        return yield* new InitializationError({
          cause: {
            operation: "resolveQueueBindings",
            consumer: entry.consumer.name,
            binding: entry.binding,
            nameBinding: entry.nameBinding
          },
          message: `Cannot resolve the Cloudflare queue bindings for "${entry.consumer.name}". Include the native queue sender and its physical name in this Worker's deployment.`
        });
      }

      return { entry, queue: sender.value, queueName: queueName.value };
    })
  );

  const fibers = yield* FiberSet.make<void>();
  let state: "ready" | "running" | "stopped" | "closed" = "ready";

  const stop = Effect.sync(() => {
    if (state === "ready" && Option.isSome(pendingBatch)) pendingBatch.value.retryAll();

    if (state !== "closed") state = "stopped";
  });

  const consumeBatch = Effect.fn(function* (batch: MessageBatch, handlers: HandlerRegistry) {
    const destination = Option.fromUndefinedOr(destinations.find(({ queueName }) => queueName === batch.queue));

    if (Option.isNone(destination)) {
      return yield* new InitializationError({
        cause: { operation: "consumeBatch", queue: batch.queue, reason: "UnknownQueue" },
        message: `Cannot dispatch Cloudflare queue "${batch.queue}". Check that its consumer attachment and the Worker's deployed queue bindings match the generated message graph.`
      });
    }

    const { entry } = destination.value;
    const registered = Option.fromUndefinedOr(handlers.get(entry.consumer.name));

    if (Option.isNone(registered)) {
      return yield* new InitializationError({
        cause: { operation: "consumeBatch", queue: batch.queue, consumer: entry.consumer.name, reason: "NoHandler" },
        message: `Cannot dispatch Cloudflare queue "${batch.queue}". Register a handler for "${entry.consumer.name}" before consuming this queue.`
      });
    }

    const processing = yield* FiberSet.run(
      fibers,
      Effect.gen(function* () {
        for (const delivery of batch.messages) {
          if (state !== "running") {
            delivery.retry();
            continue;
          }

          yield* Effect.gen(function* () {
            const { payload, messageId, correlationId, traceContext } = yield* Schema.decodeUnknownEffect(envelope)(
              delivery.body
            );

            const dispatch = Effect.gen(function* () {
              for (const handler of registered.value) {
                yield* handler({
                  payload,
                  metadata: { messageId, correlationId, traceContext, retryAttempt: delivery.attempts }
                });
              }
            }).pipe(
              Effect.withSpan("signalgraph.consume", {
                attributes: {
                  "signalgraph.message.name": entry.consumer.message.name,
                  "signalgraph.consumer.name": entry.consumer.name,
                  "signalgraph.message.id": messageId,
                  "signalgraph.correlation.id": correlationId,
                  "signalgraph.retry.attempt": delivery.attempts
                }
              })
            );

            yield* Option.isSome(traceContext) ? withSpanContext(dispatch, traceContext.value) : dispatch;
          }).pipe(
            Effect.matchCauseEffect({
              onSuccess: () => Effect.sync(() => delivery.ack()),
              onFailure: (cause) =>
                Effect.gen(function* () {
                  const delaySeconds = entry.retryDelays[delivery.attempts - 1] ?? 0;

                  if (delaySeconds > 0) delivery.retry({ delaySeconds });
                  else delivery.retry();

                  yield* Effect.logWarning("Cloudflare queue delivery failed", cause).pipe(
                    Effect.annotateLogs({
                      queue: batch.queue,
                      consumer: entry.consumer.name,
                      deliveryId: delivery.id,
                      attempt: delivery.attempts
                    })
                  );
                })
            })
          );
        }
      })
    );

    yield* Fiber.join(processing);
  });

  return Broker.of({
    start: ({ handlers }) =>
      Effect.gen(function* () {
        if (state !== "ready") return;

        state = "running";

        if (Option.isSome(pendingBatch)) yield* consumeBatch(pendingBatch.value, handlers);
      }),
    stop,
    awaitIdle: FiberSet.awaitEmpty(fibers),
    close: Effect.gen(function* () {
      yield* stop;
      state = "closed";
      yield* FiberSet.clear(fibers);
    }),
    deliver: Effect.fn(function* ({ message, data }) {
      if (state === "closed") {
        return yield* new ConnectionError({
          cause: { operation: "publish", message, reason: "BrokerClosed" },
          message: `Cannot publish "${message}" after the Cloudflare broker has closed. Publish within an active Worker invocation.`
        });
      }

      const routes = destinations.filter(({ entry }) => entry.consumer.message.name === message);

      if (routes.length === 0) {
        return yield* new ConnectionError({
          cause: { operation: "publish", message, reason: "NoDestinations" },
          message: `Cannot publish "${message}" to Cloudflare Queues. Declare a consumer for this message and deploy its queue.`
        });
      }

      const encoded = yield* Effect.gen(function* () {
        const payload = yield* Schema.decodeUnknownEffect(Schema.Json)(data.payload);

        return yield* Schema.encodeEffect(envelope)({
          payload,
          messageId: data.metadata.messageId,
          correlationId: data.metadata.correlationId,
          traceContext: data.metadata.traceContext
        });
      }).pipe(
        Effect.catchTag("SchemaError", (cause) =>
          Effect.fail(
            new InvalidPayloadError({
              cause,
              message: `Cannot publish "${message}" to Cloudflare Queues. Check that its schema encodes a valid JSON payload.`
            })
          )
        )
      );

      const confirmed: Array<string> = [];
      const uncertain: Array<{ readonly queue: string; readonly cause: Cause.UnknownError }> = [];

      for (const { queue, queueName } of routes) {
        const outcome = yield* Effect.tryPromise(() => queue.send(encoded, { contentType: "text" })).pipe(
          Effect.result
        );

        if (Result.isFailure(outcome)) uncertain.push({ queue: queueName, cause: outcome.failure });
        else confirmed.push(queueName);
      }

      if (uncertain.length > 0) {
        return yield* new ConnectionError({
          cause: { operation: "publish", message, messageId: data.metadata.messageId, confirmed, uncertain },
          message: `Cloudflare did not confirm delivery of "${message}" to every queue. Reconcile delivery for message "${data.metadata.messageId}" before publishing it again.`
        });
      }
    })
  });
});

/** Provides publishing for a Worker invocation such as an HTTP request. */
export const cloudflareBrokerLayer = (
  graph: MessageGraph,
  env: CloudflareQueueBindings
): Layer.Layer<Broker, InitializationError> => Layer.effect(Broker, makeCloudflareBroker(graph, env, Option.none()));

/** Provides a broker whose start processes and settles the batch delivered to the Worker. */
export const cloudflareBatchBrokerLayer = (
  graph: MessageGraph,
  env: CloudflareQueueBindings,
  batch: MessageBatch
): Layer.Layer<Broker, InitializationError> =>
  Layer.effect(Broker, makeCloudflareBroker(graph, env, Option.some(batch)));
