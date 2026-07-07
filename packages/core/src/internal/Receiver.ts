import { Effect, Schema } from "effect";
import type * as Consumer from "../Consumer.ts";
import * as Message from "../Message.ts";
import * as Errors from "../Errors.ts";

export interface Receiver {
  readonly messageName: string;
  readonly handler: (payload: unknown) => Effect.Effect<void, never, never>;
}

export const fromConsumer = <
  const Name extends string,
  TSchema extends Message.MessageSchema
>(
  consumer: Consumer.Consumer<
    Name,
    Message.Message<Name, TSchema>
  >
): Receiver => ({
  messageName: consumer.message.name,
  handler: (payload) =>
    Effect.sync(() => Schema.decodeUnknownSync(consumer.message.schema)(payload)).pipe(
      Effect.mapError(
        (cause) =>
          new Errors.InvalidMessagePayload({
            messageName: consumer.message.name,
            payload,
            cause
          })
      ),
      Effect.flatMap(consumer.handler),
      Effect.tapCause(Effect.logError),
      Effect.catchCause(() => Effect.void)
    )
});
