import { RabbitMQBroker } from "@signalgraph/adapter-rabbitmq";
import { Devtools } from "@signalgraph/devtools";
import { Console, Effect, Layer } from "effect";

import { Client } from "../generated/index.ts";
import { traceExportLayer } from "./telemetry.ts";

const program = Effect.gen(function* () {
  const client = yield* Client;

  yield* client.billing.handle(({ payload }) =>
    Effect.gen(function* () {
      yield* Console.log("Billing received: ", payload);
      yield* client.billingCompleted.publish(payload);
    })
  );

  yield* client.analytics.handle(({ payload }) => Console.log("Analytics received: ", payload));

  yield* client.email.handle(({ payload }) => Console.log("Email received: ", payload));

  yield* client.listen({ integrations: [Devtools({ port: 4300, host: "127.0.0.1", databasePath: "/tmp/dt.db" })] });
});

Effect.runPromise(
  program.pipe(
    Effect.provide(
      Layer.merge(
        RabbitMQBroker({
          url: "amqp://localhost"
        }),
        traceExportLayer("signalgraph-consumer")
      )
    )
  )
);
