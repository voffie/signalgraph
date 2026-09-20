import { NodeSdk } from "@effect/opentelemetry";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { RabbitMQBroker } from "@signalgraph/adapter-rabbitmq";
import { Effect, Layer } from "effect";

import { Client } from "../generated/index.ts";

// Run `handlers.ts` first - it declares the exchanges/queues this depends on.
const program = Effect.gen(function* () {
  const client = yield* Client;

  yield* client.ordersCreated.publish({
    orderId: "123",
  });
});

const telemetryExporter = new OTLPTraceExporter({
  url: "http://localhost:4318/v1/traces",
});

const nodeSdkLive = NodeSdk.layer(() => ({
  resource: { serviceName: "example" },
  spanProcessor: new SimpleSpanProcessor(telemetryExporter),
}));

Effect.runPromise(
  program.pipe(
    Effect.provide(
      Layer.merge(
        RabbitMQBroker({
          url: "amqp://localhost",
        }),
        nodeSdkLive,
      ),
    ),
  ),
);

await new Promise((r) => setTimeout(r, 500));
