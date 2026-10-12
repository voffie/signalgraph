import { Effect, Layer } from "effect";
import * as Broker from "signalgraph/broker";
import * as Runtime from "signalgraph/runtime";

export const TestBroker = Layer.sync(Broker.Broker, () => {
  let graph: Runtime.MessageGraph | undefined;
  let handlers: Broker.HandlerRegistry | undefined;

  return {
    deliver: ({ message, data }) =>
      Effect.gen(function* () {
        const consumers = graph?.[message]?.consumers ?? [];

        for (const consumer of consumers) {
          for (const handler of handlers?.get(consumer.name) ?? []) {
            yield* handler(data);
          }
        }
      }),

    start: ({ graph: nextGraph, handlers: nextHandlers }) =>
      Effect.sync(() => {
        graph = nextGraph;
        handlers = nextHandlers;
      })
  };
});
