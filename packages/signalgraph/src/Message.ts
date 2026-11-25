import { Data, Schema } from "effect";

/**
 * A payload codec with any decoded and encoded value types. Both directions must run without
 * contextual services. Schema failures are reported separately as SchemaError.
 */
export type MessageSchema = Schema.Codec<unknown, unknown, never, never>;

/** Structural input used when inspecting declarations imported from a project module. */
export const MessageDeclaration = Schema.TaggedStruct("Message", {
  name: Schema.NonEmptyString,
  schema: Schema.declare(Schema.isSchema)
});

/** Associates a stable broker message name with its payload decoder. */
export class Message<Name extends string, TSchema extends MessageSchema> extends Data.TaggedClass("Message")<{
  readonly name: Name;
  readonly schema: TSchema;
}> {}

/** Declares a message definition used by consumers and generated clients. */
export const message = <const Name extends string, TSchema extends MessageSchema>(options: {
  readonly name: Name;
  readonly schema: TSchema;
}): Message<Name, TSchema> => new Message({ name: options.name, schema: options.schema });

/** Represents a message definition when its name or schema is not statically known. */
export type AnyMessage<TSchema extends MessageSchema = MessageSchema> = Message<string, TSchema>;
