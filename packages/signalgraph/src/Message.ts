import { Data, type Schema } from "effect";

export type MessageSchema = Schema.Decoder<unknown, never>;

export class Message<Name extends string, TSchema extends MessageSchema> extends Data.TaggedClass("Message")<{
  readonly name: Name;
  readonly schema: TSchema;
}> {}

export const message = <const Name extends string, TSchema extends MessageSchema>(options: {
  readonly name: Name;
  readonly schema: TSchema;
}): Message<Name, TSchema> => new Message({ name: options.name, schema: options.schema });

export type AnyMessage<TSchema extends MessageSchema = MessageSchema> = Message<string, TSchema>;
