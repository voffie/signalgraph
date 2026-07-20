import { Context, Effect } from "effect";

type RawHandler = (
  payload: unknown
) => Effect.Effect<void>;

export class Broker extends Context.Service<Broker, {
  readonly deliver: (
    consumer: string,
    payload: unknown
  ) => Effect.Effect<void>;

  readonly consume: (
    consumer: string,
    handler: RawHandler
  ) => Effect.Effect<void>;
}>()("@signalgraph/runtime/Broker") { }
