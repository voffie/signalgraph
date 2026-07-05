import { Driver } from "@signalgraph/core/Driver";
import { Console, Effect, Layer } from "effect";
import type * as Message from "@signalgraph/core/Message";
import type { Receiver } from "@signalgraph/core/internal/Receiver";

export const MemoryDriver = Layer.sync(
  Driver,
  () => {
    const backend: Map<string, Set<Receiver>> = new Map();

    const publish = <
      TMessage extends Message.AnyMessage
    >(
      message: TMessage,
      payload: Message.PayloadOf<TMessage>
    ) => Effect.gen(function* () {
      const consumers = backend.get(message.name);
      if (consumers) {
        for (const consumer of consumers) {
          yield* consumer.handler(payload);
        }
      }
    });

    const subscribe = (receiver: Receiver) =>
      Effect.gen(function* () {
        yield* Console.log("Creating subscription:", { receiver });
        const existing = backend.get(receiver.messageName);
        if (existing) {
          existing.add(receiver);
        } else {
          backend.set(receiver.messageName, new Set([receiver]));
        }
      });

    return {
      publish,
      subscribe
    };
  })
