import { withSpanContext } from "@effect/opentelemetry/OtelTracer";
import { Effect, Layer } from "effect";
import * as Broker from "signalgraph/broker";
import * as Runtime from "signalgraph/runtime";

export const MemoryBroker = Layer.sync(Broker.Broker, () => {
  let handlers: Broker.HandlerRegistry | undefined;
  let graph: Runtime.MessageGraph | undefined;

  const deliver = ({ message, data }: { message: string; data: Broker.BrokerMessage }) =>
    Effect.gen(function* () {
      const consumers = graph?.[message].consumers ?? [];

      for (const consumer of consumers) {
        const metadata = data.metadata.traceContext
          ? Runtime.createConsumeMetadata({
              messageId: data.metadata.messageId,
              correlationId: data.metadata.correlationId,
              traceContext: data.metadata.traceContext
            })
          : Runtime.createConsumeMetadata({
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
    handlers: Broker.HandlerRegistry;
    graph: Runtime.MessageGraph;
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
