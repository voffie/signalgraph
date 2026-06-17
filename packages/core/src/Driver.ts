import { Context, Effect } from "effect";
import type * as Message from "./Message.ts";
import type * as Consumer from "./Consumer.ts";

export class Driver extends Context.Service<Driver, {
  readonly publish: <TMessage extends Message.AnyMessage> (
    message: TMessage,
    payload: Message.PayloadOf<TMessage>
  ) => Effect.Effect<void>;

  readonly subscribe: (
    consumer: Consumer.AnyConsumer
  ) => Effect.Effect<void>;
}>()("@signalgraph/Driver") { }
