import { Schema } from "effect";

export interface Message<
  Name extends string,
  Payload
> {
  readonly _tag: "Message";
  readonly name: Name;
  readonly schema: Schema.Schema<Payload>;
}

export const make = <
  const Name extends string,
  Payload
>(options: {
  readonly name: Name;
  readonly schema: Schema.Schema<Payload>;
}): Message<Name, Payload> => ({
  _tag: "Message",
  name: options.name,
  schema: options.schema
});

export type PayloadOf<T> =
  T extends Message<string, infer Payload>
  ? Payload
  : never
