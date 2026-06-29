import { Schema } from "effect";

export interface Message<Name extends string, PayloadSchema extends Schema.Top> {
  readonly _tag: "Message";
  readonly name: Name;
  readonly schema: PayloadSchema;
}

export const make = <
  const Name extends string,
  PayloadSchema extends Schema.Top
>(options: {
  readonly name: Name;
  readonly schema: PayloadSchema;
}): Message<Name, PayloadSchema> => ({
  _tag: "Message",
  name: options.name,
  schema: options.schema
});

export type AnyMessage<PayloadSchema extends Schema.Top = Schema.Top> = Message<string, PayloadSchema>;

export type PayloadOf<TMessage extends AnyMessage> = TMessage["schema"]["Type"]
