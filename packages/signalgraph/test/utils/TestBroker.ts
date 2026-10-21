import { Deferred, Effect, Layer, Ref } from "effect";
import * as Broker from "signalgraph/broker";
import type * as Runtime from "signalgraph/runtime";

type State = {
  readonly stopping: boolean;
  readonly activeDispatches: number;
  readonly idle: Deferred.Deferred<void>;
};

export const TestBroker = Layer.effect(
  Broker.Broker,
  Effect.gen(function* () {
    let graph: Runtime.MessageGraph | undefined;
    let handlers: Broker.HandlerRegistry | undefined;

    const initialIdle = yield* Deferred.make<void>();
    yield* Deferred.succeed(initialIdle, undefined);

    const state = yield* Ref.make<State>({
      stopping: false,
      activeDispatches: 0,
      idle: initialIdle
    });

    const beginDispatch = Effect.gen(function* () {
      const nextIdle = yield* Deferred.make<void>();

      return yield* Ref.modify(state, (current) => {
        if (current.stopping) {
          return [false, current];
        }

        return [
          true,
          {
            stopping: false,
            activeDispatches: current.activeDispatches + 1,
            idle: current.activeDispatches === 0 ? nextIdle : current.idle
          }
        ];
      });
    });

    const endDispatch = Effect.gen(function* () {
      const idle = yield* Ref.modify(state, (current) => {
        const activeDispatches = Math.max(0, current.activeDispatches - 1);

        return [
          activeDispatches === 0 && current.activeDispatches > 0 ? current.idle : undefined,
          { ...current, activeDispatches }
        ];
      });

      if (idle !== undefined) {
        yield* Deferred.succeed(idle, undefined);
      }
    });

    return {
      deliver: ({ message, data }) =>
        Effect.gen(function* () {
          const shouldDispatch = yield* beginDispatch;

          if (!shouldDispatch) {
            return;
          }

          yield* Effect.gen(function* () {
            const consumers = graph?.[message]?.consumers ?? [];
            for (const consumer of consumers) {
              for (const handler of handlers?.get(consumer.name) ?? []) {
                yield* handler(data);
              }
            }
          }).pipe(Effect.ensuring(endDispatch));
        }),

      start: ({ graph: nextGraph, handlers: nextHandlers }) =>
        Effect.sync(() => {
          graph = nextGraph;
          handlers = nextHandlers;
        }),

      stop: Ref.update(state, (current) => ({
        ...current,
        stopping: true
      })),

      awaitIdle: Effect.gen(function* () {
        const { idle } = yield* Ref.get(state);
        yield* Deferred.await(idle);
      }),

      close: Effect.void,

      status: Ref.get(state).pipe(
        Effect.map(({ activeDispatches }) => ({
          activeHandlers: activeDispatches
        }))
      )
    };
  })
);
