import { Context, type Effect } from "effect";

import type { MessageGraph } from "../runtime/client.ts";
import type { ConnectionError } from "../runtime/errors.ts";
import type { MessageMetadata } from "../runtime/metadata.ts";

interface BrokerStatus {
  readonly activeHandlers: number;
}

export interface BrokerMessage {
  readonly payload: unknown;
  readonly metadata: MessageMetadata;
}

export type BrokerHandler = (message: BrokerMessage) => Effect.Effect<void, unknown>;

export type HandlerRegistry = Map<string, Array<BrokerHandler>>;

export class Broker extends Context.Service<
  Broker,
  {
    deliver(args: { readonly message: string; readonly data: BrokerMessage }): Effect.Effect<void, unknown>;

    readonly start: (args: {
      readonly graph: MessageGraph;
      readonly handlers: HandlerRegistry;
    }) => Effect.Effect<void, unknown>;

    readonly stop: Effect.Effect<void, ConnectionError>;

    readonly awaitIdle: Effect.Effect<void>;

    readonly close: Effect.Effect<void, ConnectionError>;

    readonly status: Effect.Effect<BrokerStatus>;
  }
>()("@signalgraph/runtime/Broker") {}
