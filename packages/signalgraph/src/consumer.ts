import type * as Message from "./message.ts";

export interface Consumer<
  Name extends string,
  TMessage extends Message.AnyMessage,
> {
  readonly _tag: "Consumer";
  readonly name: Name;
  readonly message: TMessage;
}

export const consumer = <
  const Name extends string,
  TMessage extends Message.AnyMessage
>(options: {
  readonly name: Name;
  readonly message: TMessage;
}) => ({
  _tag: "Consumer",
  name: options.name,
  message: options.message,
});
