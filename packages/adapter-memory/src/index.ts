import { Effect, Layer } from "effect";
import { Broker } from "@signalgraph/runtime/broker";

export const MemoryBroker = Layer.sync(Broker, () => {
  const handlers: Map<string, Array<(payload: unknown) => Effect.Effect<void>>> = new Map();

  const deliver = (
    consumer: string,
    payload: unknown
  ) => Effect.gen(function* () {
    const list = handlers.get(consumer) ?? [];

    for (const handler of list) {
      yield* handler(payload);
    };
  });

  const consume = (
    consumer: string,
    handler: (payload: unknown) => Effect.Effect<void>
  ) => Effect.sync(() => {
    const list = handlers.get(consumer) ?? [];

    list.push(handler);

    handlers.set(consumer, list);
  });

  return {
    deliver,
    consume
  };
});

export function memory() {
  return {
    package: "@signalgraph/adapter-memory",
    layer: "MemoryBroker"
  } as const;
}
