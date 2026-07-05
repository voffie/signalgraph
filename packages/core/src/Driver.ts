import { Context, Effect } from "effect";
import type * as Message from "./Message.ts";
import type { Receiver } from "./internal/Receiver.ts";

export class Driver extends Context.Service<Driver, {
  readonly publish: <TMessage extends Message.AnyMessage> (
    message: TMessage,
    payload: Message.PayloadOf<TMessage>
  ) => Effect.Effect<void>;

  readonly subscribe: (
    receiver: Receiver
  ) => Effect.Effect<void>;
}>()("@signalgraph/Driver") { }
