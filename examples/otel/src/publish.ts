import { RabbitMQBroker } from "@signalgraph/adapter-rabbitmq";
import { Effect, Layer } from "effect";

import { Client } from "../generated/index.ts";
import { traceExportLayer } from "./telemetry.ts";

// Run `handlers.ts` first - it declares the exchanges/queues this depends on.
const program = Effect.gen(function* () {
  const client = yield* Client;

  yield* client.ordersCreated.publish({
    orderId: "123"
  });
});

Effect.runPromise(
  program.pipe(
    Effect.provide(
      Layer.merge(
        RabbitMQBroker({
          url: "amqp://localhost"
        }),
        traceExportLayer("signalgraph-publisher")
      )
    )
  )
);
