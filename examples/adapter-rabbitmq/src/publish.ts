import { RabbitMQBroker } from "@signalgraph/adapter-rabbitmq";
import { Effect } from "effect";

import { Client } from "../generated/index.ts";

// Run `handlers.ts` first to declare the RabbitMQ exchanges and queues.
const program = Effect.gen(function* () {
  const client = yield* Client;

  yield* client.orderCreated.publish({ orderId: 1 });
});

Effect.runPromise(
  program.pipe(
    Effect.provide(
      RabbitMQBroker({
        url: "amqp://localhost"
      })
    )
  )
);
