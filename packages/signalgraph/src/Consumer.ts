import { Data, Schema, type Duration } from "effect";

import * as Message from "./Message.ts";

/** The consumer fields needed to link an imported declaration to its message during generation. */
export const ConsumerDeclaration = Schema.TaggedStruct("Consumer", {
  name: Schema.NonEmptyString,
  message: Message.MessageDeclaration
});

/** Controls redelivery timing after a consumer handler fails. */
export type RetryPolicy =
  | {
      readonly type: "fixed";
      readonly delay: Duration.Input;
      readonly maxAttempts: number;
    }
  | {
      readonly type: "exponential";
      readonly initialDelay: Duration.Input;
      readonly factor?: number;
      readonly maxDelay?: Duration.Input;
      readonly maxAttempts: number;
    };

/** Associates a named handler with a message definition and delivery policy. */
export class Consumer<Name extends string, TMessage extends Message.AnyMessage> extends Data.TaggedClass("Consumer")<{
  readonly name: Name;
  readonly message: TMessage;
  readonly prefetch?: number;
  readonly retry?: RetryPolicy;
  readonly dlq?: boolean;
}> {}

/** Declares a consumer for a message definition. */
export const consumer = <const Name extends string, TMessage extends Message.AnyMessage>(options: {
  readonly name: Name;
  readonly message: TMessage;
  readonly prefetch?: number;
  readonly retry?: RetryPolicy;
  readonly dlq?: boolean;
}): Consumer<Name, TMessage> =>
  new Consumer({
    name: options.name,
    message: options.message,
    dlq: options.dlq ?? true,
    ...(options.prefetch !== undefined && { prefetch: options.prefetch }),
    ...(options.retry !== undefined && { retry: options.retry })
  });

/** Represents a consumer declaration when its name or message is not statically known. */
export type AnyConsumer = Consumer<string, Message.AnyMessage>;
