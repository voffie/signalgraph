import { Console, Effect, Layer } from "effect";
import { Client } from "../generated/index.ts";
import { RabbitMQBroker } from "@signalgraph/adapter-rabbitmq";
import { NodeSdk } from "@effect/opentelemetry";
import { SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";

const program = Effect.gen(function* () {
  const client = yield* Client;

  yield* client.billing.handle(({ payload }) => Effect.gen(function* () {
    yield* Console.log("Billing received: ", payload);
    yield* client.billingCompleted.publish(payload);
  }));

  yield* client.analytics.handle(({ payload }) =>
    Console.log("Analytics received: ", payload)
  );

  yield* client.email.handle(({ payload }) =>
    Console.log("Email received: ", payload)
  );

  yield* client.listen();
});

const telemetryExporter = new OTLPTraceExporter({
  url: "http://localhost:4318/v1/traces"
});

const nodeSdkLive = NodeSdk.layer(() => ({
  resource: { serviceName: "example" },
  spanProcessor: new SimpleSpanProcessor(telemetryExporter)
}));

Effect.runPromise(
  program.pipe(
    Effect.provide(
      Layer.merge(
        RabbitMQBroker({
          url: "amqp://localhost"
        }),
        nodeSdkLive
      )
    )
  )
);
