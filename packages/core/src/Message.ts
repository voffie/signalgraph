import { Schema } from "effect";

export type MessageSchema = Schema.Decoder<unknown, never>;

export interface Message<Name extends string, TSchema extends MessageSchema> {
  readonly _tag: "Message";
  readonly name: Name;
  readonly schema: TSchema;
}

export const make = <
  const Name extends string,
  TSchema extends MessageSchema
>(options: {
  readonly name: Name;
  readonly schema: TSchema;
}): Message<Name, TSchema> => ({
  _tag: "Message",
  name: options.name,
  schema: options.schema
});

export type AnyMessage<TSchema extends MessageSchema = MessageSchema> = Message<string, TSchema>;

export type PayloadOf<TMessage extends AnyMessage> = TMessage["schema"]["Type"]
