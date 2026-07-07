import { Effect, Schema } from "effect";
import * as Driver from "./Driver.ts";
import type * as Topology from "./Topology.ts";
import type * as Message from "./Message.ts";
import type * as Consumer from "./Consumer.ts";
import * as Receiver from "./internal/Receiver.ts";
import * as Errors from "./Errors.ts";

export const start = (
  topology: Topology.Topology<ReadonlyArray<Consumer.AnyConsumer>>
): Effect.Effect<void, never, Driver.Driver> =>
  Effect.gen(function* () {
    const driver = yield* Driver.Driver;
    for (const consumer of topology.consumers) {
      yield* driver.subscribe(
        Receiver.fromConsumer(consumer)
      );
    };
  });

export const publish = Effect.fn("publish")(function* <
  const Name extends string,
  TSchema extends Message.MessageSchema
>(
  message: Message.Message<Name, TSchema>,
  payload: unknown
): Effect.fn.Return<
  void,
  Errors.InvalidMessagePayload,
  Driver.Driver | TSchema["DecodingServices"]
> {
  const driver = yield* Driver.Driver;

  const validatedPayload = yield* Schema.decodeUnknownEffect(message.schema)(payload).pipe(
    Effect.mapError(
      (cause) => new Errors.InvalidMessagePayload({
        messageName: message.name,
        payload,
        cause
      })
    )
  );

  yield* driver.publish(message, validatedPayload);
})
