import { RabbitMQBroker } from "@signalgraph/adapter-rabbitmq";
import { Effect } from "effect";

import { Client } from "../generated/index.ts";

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
      }),
    ),
  ),
);
