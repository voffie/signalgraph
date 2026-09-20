import { Context, type Effect } from "effect";

import type { MessageGraph } from "./client.ts";
import type { MessageMetadata } from "./metadata.ts";

export interface BrokerMessage {
  readonly payload: unknown;
  readonly metadata: MessageMetadata;
}

export type BrokerHandler = (message: BrokerMessage) => Effect.Effect<void, unknown>;

export type HandlerRegistry = Map<string, Array<BrokerHandler>>;

export class Broker extends Context.Service<
  Broker,
  {
    deliver(args: {
      readonly message: string;
      readonly data: BrokerMessage;
    }): Effect.Effect<void, unknown>;

    readonly start: (args: {
      readonly graph: MessageGraph;
      readonly handlers: HandlerRegistry;
    }) => Effect.Effect<void, unknown>;
  }
>()("@signalgraph/runtime/Broker") {}
