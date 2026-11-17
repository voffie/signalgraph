import { Context, type Effect } from "effect";

import type { MessageGraph } from "../runtime/client.ts";
import type { ConnectionError } from "../runtime/errors.ts";
import type { MessageMetadata } from "../runtime/metadata.ts";

export { makeInFlight, type InFlight } from "./in-flight.ts";

export interface BrokerMessage {
  readonly payload: unknown;
  readonly metadata: MessageMetadata;
}

export type BrokerHandler = (message: BrokerMessage) => Effect.Effect<void, unknown>;

export type HandlerRegistry = Map<string, Array<BrokerHandler>>;

/**
 * Delivery is at-least-once. A message is acked only after its handler succeeded,
 * or after its retry/DLQ copy was confirmed by the broker. A crash in between can
 * deliver a message twice with the same messageId, so handlers should be idempotent.
 *
 * Shutdown order, driven by the runtime: `stop` -> `awaitIdle` (with a timeout) -> `close`.
 *
 * Every adapter should have tests for:
 * - nothing starts after `stop`, and messages published afterwards stay queued
 * - `awaitIdle` waits for a running handler, and resolves at once when idle
 * - `deliver` still works after `stop` (a draining handler may publish)
 * - `stop` and `close` are idempotent
 * - `close` with a handler still running returns its message to the broker
 */
export class Broker extends Context.Service<
  Broker,
  {
    deliver(args: { readonly message: string; readonly data: BrokerMessage }): Effect.Effect<void, unknown>;

    readonly start: (args: {
      readonly graph: MessageGraph;
      readonly handlers: HandlerRegistry;
    }) => Effect.Effect<void, unknown>;

    /**
     * Stop intake. Idempotent. No new handler invocation begins afterwards.
     * Messages received but not started are returned to the broker instead of handled.
     */
    readonly stop: Effect.Effect<void, ConnectionError>;

    /**
     * Resolves once every accepted message is settled (acked, retried, dead-lettered
     * or returned). Includes broker-side settlement, not just handler execution.
     */
    readonly awaitIdle: Effect.Effect<void>;

    /**
     * Release consumption resources. Idempotent. Running handlers are interrupted and
     * their messages go back to the broker. Does not release publishing.
     */
    readonly close: Effect.Effect<void, ConnectionError>;
  }
>()("@signalgraph/runtime/Broker") {}
