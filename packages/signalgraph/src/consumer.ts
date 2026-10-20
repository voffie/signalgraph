import type { Duration } from "effect";

import type * as Message from "./Message.ts";

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

export interface Consumer<Name extends string, TMessage extends Message.AnyMessage> {
  readonly _tag: "Consumer";
  readonly name: Name;
  readonly message: TMessage;
  readonly prefetch?: number;
  readonly retry?: RetryPolicy;
  readonly dlq?: boolean;
}

export const consumer = <const Name extends string, TMessage extends Message.AnyMessage>(options: {
  readonly name: Name;
  readonly message: TMessage;
  readonly prefetch?: number;
  readonly retry?: RetryPolicy;
  readonly dlq?: boolean;
}): Consumer<Name, TMessage> => ({
  _tag: "Consumer",
  ...options
});
