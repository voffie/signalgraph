# SignalGraph

SignalGraph generates a typed messaging client from your Effect schemas. Declare your messages and consumers. Provide a broker adapter when you run the client.

## Quick start

Use an ESM project with `"type": "module"`. This example uses RabbitMQ.

```sh
npm install effect signalgraph @signalgraph/adapter-rabbitmq
```

```ts
// schema.ts
import { Schema } from "effect";
import { consumer, message } from "signalgraph";

export const OrderCreated = message({
  name: "orders.created",
  schema: Schema.Struct({ orderId: Schema.String })
});

export const Billing = consumer({ name: "billing", message: OrderCreated });
```

```ts
// signalgraph.config.ts
import { defineConfig } from "signalgraph/config";

export default defineConfig({ schema: "./schema.ts", out: "./generated" });
```

Run `npx signalgraph generate`, then start RabbitMQ and run this application:

```ts
import { RabbitMQBroker } from "@signalgraph/adapter-rabbitmq";
import { Console, Effect } from "effect";

import { Client } from "./generated/index.ts";

const program = Effect.gen(function* () {
  const client = yield* Client;
  yield* client.billing.handle(({ payload }) => Console.log("Received order", payload.orderId));
  yield* client.listen();
});

await Effect.runPromise(program.pipe(Effect.provide(RabbitMQBroker({ url: "amqp://localhost" }))));
```

Once the consumer is running, a publisher can use the same generated client and broker layer:

```ts
const publishOrder = Effect.gen(function* () {
  const client = yield* Client;
  yield* client.ordersCreated.publish({ orderId: "order-123" });
});
```

See the [RabbitMQ example](examples/adapter-rabbitmq) for both runnable processes.

## Development

`pnpm test` compiles the CLI and runs the full suite. RabbitMQ integration tests require Docker. Run `pnpm test:run --project signalgraph` after building the CLI to run the core tests alone. `pnpm check` regenerates the example clients and type-checks the examples with the rest of the workspace.

## Links

- [Documentation](https://signalgraph-docs.voffie.workers.dev)
- [Report a bug or request a feature](https://github.com/voffie/signalgraph/issues)

## Packages

| Package                                                      | Description                              |
| ------------------------------------------------------------ | ---------------------------------------- |
| [`signalgraph`](packages/signalgraph)                        | Schema declarations and client generator |
| [`@signalgraph/adapter-rabbitmq`](packages/adapter/rabbitmq) | RabbitMQ transport                       |
| [`@signalgraph/devtools`](packages/devtools)                 | OpenTelemetry trace viewer               |

## License

MIT
