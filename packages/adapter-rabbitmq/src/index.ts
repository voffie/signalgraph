import { Effect, Layer, Queue, Schema, Scope } from "effect";
import { Broker, type HandlerRegistry } from "@signalgraph/runtime/broker";
import { ConnectionError, InitializationError, type MessageGraph } from "@signalgraph/runtime";
import * as amqp from "amqplib";

type RabbitMQOptions = {
  url: string;
};

export function RabbitMQBroker(options: RabbitMQOptions) {
  return Layer.effect(
    Broker,
    Effect.gen(function* () {
      const { url } = options;

      const layerScope = yield* Effect.scope;

      const conn = yield* Effect.acquireRelease(
        Effect.tryPromise({
          try: () => amqp.connect(url),
          catch: (cause) => new ConnectionError({
            cause,
            message: "Failed to create connection to RabbitMQ broker"
          })
        }),
        (connection) => Effect.promise(() => connection.close())
      ).pipe(
        Effect.tap((connection) =>
          Effect.sync(() => {
            connection.on("close", () => console.log("RabbitMQ connection closed"));
          })
        ));

      const publishChannel = yield* Effect.acquireRelease(
        Effect.tryPromise({
          try: () => conn.createChannel(),
          catch: (cause) => new ConnectionError({
            cause,
            message: "Failed to create connection to channel"
          })
        }),
        (connection) => Effect.promise(() => connection.close())
      ).pipe(
        Effect.tap((connection) =>
          Effect.sync(() => {
            connection.on("close", () => console.log("RabbitMQ publish channel connection closed"));
          })
        ));

      const deliver = (
        message: string,
        payload: unknown
      ) => Effect.gen(function* () {
        const json = yield* Schema.encodeEffect(Schema.UnknownFromJsonString)(payload);

        yield* Effect.sync(() =>
          publishChannel.publish(message, "", Buffer.from(json, "utf-8"))
        );
      });

      const start = ({
        graph,
        handlers
      }: {
        graph: MessageGraph;
        handlers: HandlerRegistry;
      }) => Effect.gen(function* () {
        for (const [messageName, messageDef] of Object.entries(graph)) {
          yield* Effect.tryPromise({
            try: () =>
              publishChannel.assertExchange(messageName, "fanout", {
                durable: true
              }),
            catch: (cause) => new InitializationError({
              cause,
              message: `Failed to create exchange for ${messageName}`
            })
          });

          for (const consumer of messageDef.consumers) {
            // Pin this channel's release to the broker's scope,
            // not to whatever scope surrounds this call to start().
            const consumerChannel = yield* Scope.provide(layerScope)(
              Effect.acquireRelease(
                Effect.tryPromise({
                  try: () => conn.createChannel(),
                  catch: (cause) => new ConnectionError({
                    cause,
                    message: `Failed to create connection to channel for consumer "${consumer.name}"`
                  })
                }),
                (connection) => Effect.promise(() => connection.close())
              )
            );

            const prefetch = consumer.prefetch;
            if (prefetch !== undefined) {
              yield* Effect.tryPromise({
                try: () => consumerChannel.prefetch(prefetch),
                catch: (cause) => new InitializationError({
                  cause,
                  message: `Failed to set prefetch of ${prefetch} on channel`
                })
              });
            }

            yield* Effect.tryPromise({
              try: () =>
                consumerChannel.assertQueue(consumer.name, {
                  durable: true
                }),
              catch: (cause) => new InitializationError({
                cause,
                message: `Failed to create queue for ${consumer.name}`
              })
            });

            yield* Effect.tryPromise({
              try: () =>
                consumerChannel.bindQueue(consumer.name, messageName, ""),
              catch: (cause) => new InitializationError({
                cause,
                message: `Failed to bind queue ${consumer.name} to exchange ${messageName}`
              })
            });

            const messages = yield* Queue.unbounded<amqp.ConsumeMessage>();

            yield* Effect.tryPromise({
              try: () =>
                consumerChannel.consume(consumer.name, (msg) => {
                  if (msg) {
                    Queue.offerUnsafe(messages, msg);
                  }
                }),
              catch: (cause) => new InitializationError({
                cause,
                message: `Failed to start consuming ${consumer.name}`
              })
            });

            const processMessage = Effect.gen(function* () {
              const msg = yield* Queue.take(messages);

              yield* Effect.gen(function* () {
                const payload = yield* Schema.decodeUnknownEffect(
                  Schema.UnknownFromJsonString
                )(msg.content.toString("utf-8"));

                const list = handlers.get(consumer.name) ?? [];

                for (const handler of list) {
                  yield* handler(payload);
                }
              }).pipe(
                Effect.matchEffect({
                  onSuccess: () => Effect.sync(() => consumerChannel.ack(msg)),
                  onFailure: () => Effect.sync(() => consumerChannel.nack(msg))
                })
              );
            });

            // Fork into the broker's own scope so this loop outlives
            // the start() call itself.
            yield* Effect.forkIn(layerScope)(
              Effect.forever(processMessage).pipe(
                Effect.catchCause(Effect.logError)
              )
            );
          }
        }
      });

      return {
        deliver,
        start
      };
    })
  );
}

export function rabbitmq() {
  return {
    package: "@signalgraph/adapter-rabbitmq",
    layer: "RabbitMQBroker",
  } as const;
}
