import { withSpanContext } from "@effect/opentelemetry/OtelTracer";
import { Effect, Layer, Schema } from "effect";
import * as PersistedQueue from "effect/persistence/PersistedQueue";
import * as Broker from "signalgraph/broker";
import * as Runtime from "signalgraph/runtime";

const PersistedQueueLayer = PersistedQueue.layer.pipe(Layer.provide(PersistedQueue.layerStoreMemory));

const BrokerMessageSchema = Schema.Struct({
  payload: Schema.Unknown,
  metadata: Schema.Unknown
});

type QueuedBrokerMessage = typeof BrokerMessageSchema.Type;

type ConsumerQueue = PersistedQueue.PersistedQueue<QueuedBrokerMessage>;

export function MemoryBroker() {
  return Layer.effect(
    Broker.Broker,
    Effect.gen(function* () {
      const layerScope = yield* Effect.scope;

      const queues = new Map<string, ConsumerQueue>();

      let handlers: Broker.HandlerRegistry | undefined;
      let graph: Runtime.MessageGraph | undefined;

      const dispatch = (messageName: string, consumerName: string, data: QueuedBrokerMessage) =>
        Effect.gen(function* () {
          const brokerMessage = data as Broker.BrokerMessage;
          const originalMetadata = brokerMessage.metadata;

          const metadata = originalMetadata.traceContext
            ? Runtime.createConsumeMetadata({
                messageId: originalMetadata.messageId,
                correlationId: originalMetadata.correlationId,
                traceContext: originalMetadata.traceContext
              })
            : Runtime.createConsumeMetadata({
                messageId: originalMetadata.messageId,
                correlationId: originalMetadata.correlationId
              });

          const consumerHandlers = handlers?.get(consumerName) ?? [];

          const consume = Effect.gen(function* () {
            for (const handler of consumerHandlers) {
              yield* handler({
                payload: brokerMessage.payload,
                metadata
              });
            }
          }).pipe(
            Effect.withSpan("signalgraph.consume", {
              attributes: {
                "signalgraph.message.name": messageName,
                "signalgraph.consumer.name": consumerName,
                "signalgraph.message.id": metadata.messageId,
                "signalgraph.correlation.id": metadata.correlationId
              }
            })
          );

          if (metadata.traceContext) {
            yield* withSpanContext(consume, metadata.traceContext);
          } else {
            yield* consume;
          }
        });

      const deliver = ({ message, data }: { message: string; data: Broker.BrokerMessage }) =>
        Effect.gen(function* () {
          const consumers = graph?.[message].consumers ?? [];

          for (const consumer of consumers) {
            if (!handlers?.get(consumer.name)?.length) {
              continue;
            }

            const queue = queues.get(consumer.name);

            if (!queue) {
              return yield* new Runtime.InitializationError({
                cause: undefined,
                message: `Queue for consumer "${consumer.name}" has not been initialized`
              });
            }

            yield* queue.offer(data as QueuedBrokerMessage);
          }
        });

      const start = ({
        graph: runtimeGraph,
        handlers: runtimeHandlers
      }: {
        handlers: Broker.HandlerRegistry;
        graph: Runtime.MessageGraph;
      }) =>
        Effect.gen(function* () {
          graph = runtimeGraph;
          handlers = runtimeHandlers;

          for (const [messageName, messageDef] of Object.entries(graph)) {
            for (const consumer of messageDef.consumers) {
              const queue = yield* PersistedQueue.make({
                name: consumer.name,
                schema: BrokerMessageSchema,
                maxAttempts: 1
              });

              queues.set(consumer.name, queue);

              const worker = Effect.forever(
                queue
                  .take((data) => dispatch(messageName, consumer.name, data))
                  .pipe(
                    Effect.catchCause((cause) =>
                      Effect.logError(`Signalgraph consumer "${consumer.name}" failed`, cause)
                    )
                  )
              );

              yield* Effect.forkIn(layerScope)(worker);
            }
          }
        }).pipe(Effect.provide(PersistedQueueLayer));

      return {
        deliver,
        start
      };
    })
  );
}
