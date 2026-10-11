import { withSpanContext } from "@effect/opentelemetry/OtelTracer";
import { Effect, Layer } from "effect";
import {
  Broker,
  type BrokerMessage,
  createConsumeMetadata,
  type HandlerRegistry,
  type MessageGraph
} from "signalgraph/runtime";

export const MemoryBroker = Layer.sync(Broker, () => {
  let handlers: HandlerRegistry | undefined;
  let graph: MessageGraph | undefined;

  const deliver = ({ message, data }: { message: string; data: BrokerMessage }) =>
    Effect.gen(function* () {
      const consumers = graph?.[message].consumers ?? [];

      for (const consumer of consumers) {
        const metadata = data.metadata.traceContext
          ? createConsumeMetadata({
              messageId: data.metadata.messageId,
              correlationId: data.metadata.correlationId,
              traceContext: data.metadata.traceContext
            })
          : createConsumeMetadata({
              messageId: data.metadata.messageId,
              correlationId: data.metadata.correlationId
            });

        const list = handlers?.get(consumer.name) ?? [];

        const dispatch = Effect.forEach(
          list,
          (handler) =>
            handler({
              payload: data.payload,
              metadata
            }),
          { discard: true }
        ).pipe(
          Effect.withSpan("signalgraph.consume", {
            attributes: {
              "signalgraph.message.name": message,
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
      }
    });

  const start = ({
    graph: runtimeGraph,
    handlers: runtimeHandlers
  }: {
    handlers: HandlerRegistry;
    graph: MessageGraph;
  }) =>
    Effect.sync(() => {
      graph = runtimeGraph;
      handlers = runtimeHandlers;
    });

  return {
    deliver,
    start
  };
});
