import { Context, type Effect } from "effect";

import type { MessageGraph } from "../runtime/client.ts";
import type { ConnectionError, InitializationError, InvalidPayloadError } from "../runtime/errors.ts";
import type { MessageMetadata } from "../runtime/metadata.ts";

export { trackBrokerDeliveries, type InFlight } from "./in-flight.ts";

/** A message at the transport boundary, before the receiver decodes its payload. */
export interface BrokerMessage {
  readonly payload: unknown;
  readonly metadata: MessageMetadata;
}

/** Runs a registered handler. The application may fail with any handler-specific error. */
export type BrokerHandler = (message: BrokerMessage) => Effect.Effect<void, unknown>;

/** Registered handlers grouped by consumer name, in dispatch order. */
export type HandlerRegistry = Map<string, Array<BrokerHandler>>;

/** The lifecycle and delivery contract implemented by each broker adapter. */
export interface IBroker {
  /** Sends a message to the broker and waits for transport acceptance. */
  readonly deliver: (args: {
    readonly message: string;
    readonly data: BrokerMessage;
  }) => Effect.Effect<void, ConnectionError | InvalidPayloadError>;
  /** Prepares the supplied topology and begins consuming registered messages. */
  readonly start: (args: {
    readonly graph: MessageGraph;
    readonly handlers: HandlerRegistry;
  }) => Effect.Effect<void, ConnectionError | InitializationError>;
  /** Stops intake and returns deliveries whose handlers have not started. */
  readonly stop: Effect.Effect<void, ConnectionError>;
  /** Resolves once every accepted delivery has been settled. */
  readonly awaitIdle: Effect.Effect<void>;
  /** Interrupts remaining handlers and returns their unsettled deliveries to the broker. */
  readonly close: Effect.Effect<void, ConnectionError>;
}

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
export class Broker extends Context.Service<Broker, IBroker>()("@signalgraph/runtime/Broker") {}
