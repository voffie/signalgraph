import { Effect, Layer, Queue, Schema } from "effect";
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
      const conn = yield* Effect.acquireRelease(
        Effect.tryPromise({
          try: () => amqp.connect(options.url),
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

      const channel = yield* Effect.acquireRelease(
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
            connection.on("close", () => console.log("RabbitMQ channel connection closed"));
          })
        ));

      const deliver = (
        message: string,
        payload: unknown
      ) => Effect.gen(function* () {
        const json = yield* Schema.encodeEffect(Schema.UnknownFromJsonString)(payload);

        yield* Effect.sync(() =>
          channel.publish(message, "", Buffer.from(json, "utf-8"))
        );
      });

      // TODO:
      // RabbitMQ currently uses a single channel for all consumers.
      // This means QoS settings (prefetch, flow control, etc.) are shared.
      // Consider switching to one channel per consumer if isolation or
      // per-consumer configuration becomes necessary.
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
              channel.assertExchange(messageName, "fanout", {
                durable: true
              }),
            catch: (cause) => new InitializationError({
              cause,
              message: `Failed to create exchange for ${messageName}`
            })
          });

          for (const consumer of messageDef.consumers) {
            yield* Effect.tryPromise({
              try: () =>
                channel.assertQueue(consumer, {
                  durable: true
                }),
              catch: (cause) => new InitializationError({
                cause,
                message: `Failed to create queue for ${consumer}`
              })
            });

            yield* Effect.tryPromise({
              try: () =>
                channel.bindQueue(consumer, messageName, ""),
              catch: (cause) => new InitializationError({
                cause,
                message: `Failed to bind queue ${consumer} to exchange ${messageName}`
              })
            });

            const messages = yield* Queue.unbounded<amqp.ConsumeMessage>();

            yield* Effect.tryPromise({
              try: () =>
                channel.consume(consumer, (msg) => {
                  if (msg) {
                    Queue.offerUnsafe(messages, msg);
                  }
                }),
              catch: (cause) => new InitializationError({
                cause,
                message: `Failed to start consuming ${consumer}`
              })
            });

            const processMessage = Effect.gen(function* () {
              const msg = yield* Queue.take(messages);

              yield* Effect.gen(function* () {
                const payload = yield* Schema.decodeUnknownEffect(
                  Schema.UnknownFromJsonString
                )(msg.content.toString("utf-8"));

                const list = handlers.get(consumer) ?? [];

                for (const handler of list) {
                  yield* handler(payload);
                }
              }).pipe(
                Effect.matchEffect({
                  onSuccess: () => Effect.sync(() => channel.ack(msg)),
                  onFailure: () => Effect.sync(() => channel.nack(msg))
                })
              );
            });

            yield* Effect.forkChild(
              Effect.forever(processMessage).pipe(
                Effect.catchCause(Effect.logError)
              )
            );
          }
        }

        return yield* Effect.never;
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
