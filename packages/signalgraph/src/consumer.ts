import type * as Message from "./message.ts";
import type { Duration, Effect } from "effect";

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

export interface RetryContext {
  readonly attempt: number;
  readonly cause: unknown;
  readonly messageId: string;
}

export interface ConsumerHooks {
  readonly onSuccess?: (ctx: { readonly messageId: string; }) => Effect.Effect<void>;
  readonly onRetry?: (ctx: RetryContext) => Effect.Effect<void>;
  readonly onFailure?: (ctx: RetryContext) => Effect.Effect<void>;
}

export interface Consumer<Name extends string, TMessage extends Message.AnyMessage> {
  readonly _tag: "Consumer";
  readonly name: Name;
  readonly message: TMessage;
  readonly prefetch?: number;
  readonly retry?: RetryPolicy;
  readonly dlq?: boolean;
  readonly hooks?: ConsumerHooks;
}

export const consumer = <const Name extends string, TMessage extends Message.AnyMessage>(options: {
  readonly name: Name;
  readonly message: TMessage;
  readonly prefetch?: number;
  readonly retry?: RetryPolicy;
  readonly dlq?: boolean;
  readonly hooks?: ConsumerHooks;
}): Consumer<Name, TMessage> => ({
  _tag: "Consumer",
  ...options,
});
