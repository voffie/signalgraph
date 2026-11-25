import { Effect, Layer } from "effect";
import * as Broker from "signalgraph/broker";
import * as Runtime from "signalgraph/runtime";

export const TestBroker = Layer.effect(
  Broker.Broker,
  Effect.sync(() => {
    let graph: Runtime.MessageGraph | undefined;
    let handlers: Broker.HandlerRegistry | undefined;
    let stopping = false;
    const inFlight = Broker.trackBrokerDeliveries();

    return {
      deliver: ({ message, data }) =>
        Effect.suspend(() => {
          // A real broker keeps the message queued while consumers are stopped.
          // This in-memory broker has no queue, so it just doesn't dispatch.
          if (stopping) {
            return Effect.void;
          }

          const leave = inFlight.enter();

          return Effect.gen(function* () {
            const consumers = graph?.[message]?.consumers ?? [];

            for (const consumer of consumers) {
              for (const handler of handlers?.get(consumer.name) ?? []) {
                yield* handler(data);
              }
            }
          }).pipe(
            Effect.mapError(
              (cause) =>
                new Runtime.InvalidPayloadError({
                  cause,
                  message: `In-memory delivery of "${message}" failed. Check its registered handler.`
                })
            ),
            Effect.ensuring(Effect.sync(leave))
          );
        }),

      start: ({ graph: nextGraph, handlers: nextHandlers }) =>
        Effect.sync(() => {
          graph = nextGraph;
          handlers = nextHandlers;
        }),

      stop: Effect.sync(() => {
        stopping = true;
      }),

      awaitIdle: inFlight.awaitIdle,

      // Handlers run inline in the publisher's fiber, so there is nothing to interrupt.
      close: Effect.void
    };
  })
);
