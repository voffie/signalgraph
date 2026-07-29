import { Context, type Effect } from "effect";
import type { MessageGraph } from "./client.ts";
import type { InitializationError, InvalidPayloadError } from "./errors.ts";

export class Broker extends Context.Service<Broker, {
  readonly deliver: (
    consumer: string,
    payload: unknown
  ) => Effect.Effect<void>;

  listen(args: {
    graph: MessageGraph,
    handlers: Map<
      string,
      Array<(payload: unknown) => Effect.Effect<void, InvalidPayloadError>>
    >;
  }): Effect.Effect<void, InitializationError>;
}>()("@signalgraph/runtime/Broker") { }
