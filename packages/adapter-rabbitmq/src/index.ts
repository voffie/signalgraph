import { Effect, Layer } from "effect";
import { Broker } from "@signalgraph/runtime/broker";
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
          catch: (cause) => new Error(`Failed to connect to RabbitMQ: ${cause}`)
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
          catch: (cause) => new Error(`Failed to create channel: ${cause}`)
        }),
        (connection) => Effect.promise(() => connection.close())
      ).pipe(
        Effect.tap((connection) =>
          Effect.sync(() => {
            connection.on("close", () => console.log("RabbitMQ channel connection closed"));
          })
        ));

      return {
        deliver: () => Effect.void,
        consume: () => Effect.void
      };
    }));
}

export function rabbitmq() {
  return {
    package: "@signalgraph/adapter-rabbitmq",
    layer: "RabbitMQBroker",
  } as const;
}
