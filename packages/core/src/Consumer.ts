import { Effect } from "effect";
import * as Message from "./Message.ts";
import type { AnyMessage } from "./Topology.ts";

export interface Consumer<
  Name extends string,
  TMessage extends AnyMessage
> {
  readonly _tag: "Consumer";
  readonly name: Name;
  readonly message: TMessage;
  readonly handler: (payload: Message.PayloadOf<TMessage>) => Effect.Effect<void>;
}

export const make = <
  const Name extends string,
  TMessage extends AnyMessage
>(options: {
  readonly name: Name;
  readonly message: TMessage;
  readonly handler: (payload: Message.PayloadOf<TMessage>) => Effect.Effect<void>;
}): Consumer<Name, TMessage> => ({
  _tag: "Consumer",
  name: options.name,
  message: options.message,
  handler: options.handler
});
