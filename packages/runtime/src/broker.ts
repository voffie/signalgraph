import { Context, type Effect } from "effect";
import type { MessageGraph } from "./client.ts";

export type BrokerHandler = (
  payload: unknown
) => Effect.Effect<void, unknown>;

export type HandlerRegistry = Map<
  string,
  Array<BrokerHandler>
>;

export class Broker extends Context.Service<Broker, {
  readonly deliver: (
    message: string,
    payload: unknown
  ) => Effect.Effect<void, unknown>;

  readonly start: (args: {
    graph: MessageGraph,
    handlers: HandlerRegistry;
  }) => Effect.Effect<void, unknown>;
}>()("@signalgraph/runtime/Broker") { }
