import { Effect, Layer, Schema } from "effect";
import { Broker } from "@signalgraph/runtime/broker";
import { ConnectionError, InitializationError, type InvalidPayloadError, type MessageGraph } from "@signalgraph/runtime";
import * as amqp from "amqplib";
import * as Console from "effect/Console";

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
        consumer: string,
        payload: unknown
      ) => Effect.gen(function* () {
        const jsonString = yield* Schema.encodeEffect(Schema.UnknownFromJsonString)(payload);
        const buffer = Buffer.from(jsonString, "utf-8");
        yield* Effect.sync(() => {
          channel.sendToQueue(consumer, buffer);
        });
      }).pipe(
        Effect.catch((cause) => Effect.sync(() => console.error(cause)))
      );

      const listen = (
        args: {
          graph: MessageGraph,
          handlers: Map<
            string,
            Array<(payload: unknown) => Effect.Effect<void, InvalidPayloadError>>
          >;
        }) => Effect.gen(function* () {
          const { handlers } = args;

          for (const consumer of handlers.keys()) {
            yield* Console.log(`Creating queue for ${consumer}`);
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
            yield* Console.log(`✓ Created queue for ${consumer}`);
          }
        });

      return {
        deliver,
        listen
      };
    }));
}

export function rabbitmq() {
  return {
    package: "@signalgraph/adapter-rabbitmq",
    layer: "RabbitMQBroker",
  } as const;
}
