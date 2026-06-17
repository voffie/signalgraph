import { Effect } from "effect";
import * as Driver from "./Driver.ts";
import type * as Topology from "./Topology.ts";
import type * as Message from "./Message.ts";
import type * as Consumer from "./Consumer.ts";

export const start = (topology: Topology.Topology<ReadonlyArray<Consumer.AnyConsumer>>): Effect.Effect<void, unknown, Driver.Driver> =>
  Effect.gen(function* () {
    const driver = yield* Driver.Driver;
    for (const consumer of topology.consumers) {
      yield* driver.subscribe(consumer);
    }
  });

export const publish = <
  TMessage extends Message.AnyMessage
>(
  message: TMessage,
  payload: Message.PayloadOf<TMessage>
): Effect.Effect<void, unknown, Driver.Driver> =>
  Effect.gen(function* () {
    const driver = yield* Driver.Driver;
    yield* driver.publish(message, payload);
  })
