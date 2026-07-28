import { Context, type Effect } from "effect";

type RawHandler<E = never> = (
  payload: unknown
) => Effect.Effect<void, E>;

export class Broker extends Context.Service<Broker, {
  readonly deliver: (
    consumer: string,
    payload: unknown
  ) => Effect.Effect<void>;

  consume<E>(
    consumer: string,
    handler: RawHandler<E>
  ): Effect.Effect<void>;
}>()("@signalgraph/runtime/Broker") { }
