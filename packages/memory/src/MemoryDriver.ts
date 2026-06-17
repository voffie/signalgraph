import { Driver } from "@signalgraph/core/Driver";
import { Console, Effect, Layer } from "effect";
import type * as Consumer from "@signalgraph/core/Consumer";
import type * as Message from "@signalgraph/core/Message";

export const MemoryDriver = Layer.sync(
  Driver,
  () => {
    const backend: Map<string, Set<Consumer.AnyConsumer>> = new Map();

    const publish = <
      TMessage extends Message.AnyMessage
    >(
      message: TMessage,
      payload: unknown
    ) => Effect.gen(function* () {
      const consumers = backend.get(message.name);
      if (consumers) {
        for (const consumer of consumers) {
          yield* consumer.handler(payload);
        }
      }
    });

    const subscribe = (consumer: Consumer.AnyConsumer) =>
      Effect.gen(function* () {
        yield* Console.log("Creating subscription:", { consumer: consumer.name, message: consumer.message.name });
        const existing = backend.get(consumer.message.name);
        if (existing) {
          existing.add(consumer);
        } else {
          backend.set(consumer.message.name, new Set([consumer]));
        }
      });

    return {
      publish,
      subscribe
    };
  })
