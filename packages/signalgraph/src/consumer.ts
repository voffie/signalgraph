import type * as Message from "./message.ts";

export interface Consumer<Name extends string, TMessage extends Message.AnyMessage> {
  readonly _tag: "Consumer";
  readonly name: Name;
  readonly message: TMessage;
  readonly prefetch?: number;
}

export const consumer = <const Name extends string, TMessage extends Message.AnyMessage>(options: {
  readonly name: Name;
  readonly message: TMessage;
  readonly prefetch?: number;
}): Consumer<Name, TMessage> => ({
  _tag: "Consumer",
  name: options.name,
  message: options.message,
  ...(options.prefetch !== undefined ? { prefetch: options.prefetch } : {}),
});
