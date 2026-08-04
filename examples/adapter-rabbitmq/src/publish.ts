import { Effect } from "effect";
import { Client } from "../generated/index.ts";
import { RabbitMQBroker } from "@signalgraph/adapter-rabbitmq";

// Run `handlers.ts` first - it declares the exchanges/queues this depends on.
const program = Effect.gen(function* () {
  const client = yield* Client;

  yield* client.orderCreated.publish({ orderId: 1 });
});

Effect.runPromise(
  program.pipe(
    Effect.provide(
      RabbitMQBroker({
        url: "amqp://localhost",
      })
    )
  ))
