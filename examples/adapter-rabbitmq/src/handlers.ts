import { Console, Effect } from "effect";
import { Client } from "../generated/index.ts";
import { RabbitMQBroker } from "@signalgraph/adapter-rabbitmq";

const program = Effect.gen(function* () {
  const client = yield* Client;

  yield* client.analytics.handle(({ payload }) =>
    Effect.gen(function* () {
      yield* Console.log("Analytics received: ", payload);

      yield* client.orderCompleted.publish(payload);
    })
  );

  yield* client.billing.handle(({ payload }) =>
    Effect.gen(function* () {
      yield* Console.log("Email received: ", payload);
      yield* client.orderCreated.publish({ orderId: payload.orderId + 1 });
    })
  );

  yield* client.start();
});

Effect.runPromise(
  program.pipe(
    Effect.scoped,
    Effect.provide(
      RabbitMQBroker({
        url: "amqp://localhost",
      })
    )
  ))
