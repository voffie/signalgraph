import { Effect } from "effect";
import { Broker } from "./broker.ts";

export interface Message<P> {
  publish(payload: P): Effect.Effect<void>;
}

export type Handler<P> = (
  ctx: {
    readonly payload: P;
  }
) => Effect.Effect<void>;

export interface Consumer<P> {
  handle(handler: Handler<P>): Effect.Effect<void>;
}

export type Routing = Record<string, ReadonlyArray<string>>;

type ClientShape = Record<
  string,
  Message<unknown> | Consumer<unknown>
>;

export function createClient<T extends ClientShape>(
  routing: Routing
) {
  return Effect.gen(function* () {
    const broker = yield* Broker;

    const client: Record<string, unknown> = {};

    for (const [message, _] of Object.entries(routing)) {
      client[message] = {
        publish(payload: unknown) {
          return Effect.forEach(
            routing[message],
            (consumer) => broker.deliver(consumer, payload),
            { discard: true }
          );
        }
      };
    };

    const consumerNames = new Set(Object.values(routing).flat());

    for (const consumer of consumerNames) {
      client[consumer] = {
        handle(handler: Handler<unknown>) {
          return broker.consume(
            consumer,
            (payload) => handler({ payload })
          );
        }
      };
    }

    return client as T;
  });
}
