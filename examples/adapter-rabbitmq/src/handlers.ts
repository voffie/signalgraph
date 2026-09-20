import { RabbitMQBroker } from "@signalgraph/adapter-rabbitmq";
import { Console, Effect } from "effect";

import { Client } from "../generated/index.ts";

const program = Effect.gen(function* () {
  const client = yield* Client;

  yield* client.analytics.handle(({ payload }) =>
    Effect.gen(function* () {
      yield* Console.log("Analytics received: ", payload);
      yield* client.orderCompleted.publish(payload);
    }),
  );

  yield* client.shipping.handle(({ payload }) =>
    Effect.gen(function* () {
      yield* Console.log("Shipping received: ", payload);
      yield* client.orderCreated.publish({ orderId: payload.orderId + 1 });
    }),
  );

  yield* client.listen();
});

Effect.runPromise(
  program.pipe(
    Effect.provide(
      RabbitMQBroker({
        url: "amqp://localhost",
      }),
    ),
  ),
);
