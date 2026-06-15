import * as Message from "./Message.ts";
import type { Metadata } from "./Metadata.ts";

export interface Envelope<
  TMessage extends Message.Message<string, unknown>
> {
  readonly _tag: "Envelope";
  readonly payload: Message.PayloadOf<TMessage>;
  readonly metadata: Metadata;
}

export const make = <
  TMessage extends Message.Message<string, unknown>
>(options: {
  readonly payload: Message.PayloadOf<TMessage>;
  readonly metadata?: Metadata;
}): Envelope<TMessage> => ({
  _tag: "Envelope",
  payload: options.payload,
  metadata: options.metadata ?? {}
});
