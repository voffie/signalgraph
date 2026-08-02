import { Effect, Layer } from "effect";
import { Broker, type HandlerRegistry } from "@signalgraph/runtime/broker";
import type { MessageGraph } from "@signalgraph/runtime";

export const MemoryBroker = Layer.sync(Broker, () => {
  let handlers: HandlerRegistry | undefined;
  let graph: MessageGraph | undefined;

  const deliver = (
    message: string,
    payload: unknown
  ) => Effect.gen(function* () {
    const consumers = graph?.[message].consumers ?? [];

    for (const consumer of consumers) {
      const list = handlers?.get(consumer) ?? [];

      for (const handler of list) {
        yield* handler(payload);
      };
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

export function memory() {
  return {
    package: "@signalgraph/adapter-memory",
    layer: "MemoryBroker"
  } as const;
}
