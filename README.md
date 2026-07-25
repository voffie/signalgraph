# SignalGraph

Type-safe event-driven architecture for TypeScript.

```ts
const client = yield* makeClient;

yield* client.billing.handle(({ payload }) => Effect.gen(function* () {
  yield* Console.log("Billing received: ", payload);
}));

yield* client.ordersCreated.publish({
    orderId: "123"
});
```

## Install
```bash
pnpm add signalgraph
pnpm add @signalgraph/runtime
pnpm add @signalgraph/adapter-*
```

Substitute "*" for a valid adapter that is supported

## Configure
SignalGraph exposes a config file `signalgraph.config.ts` that allows the user
to define options such as:
* out directory for the generated files
* which broker to use
* where the schema lives

Example config (taken from `examples/adapter-memory`):
```ts
import { defineConfig } from "signalgraph/config";
import { memory } from "@signalgraph/adapter-memory";

export default defineConfig({
  schema: "./src/schema/schema.ts",
  out: "./generated",
  broker: memory()
});
```

## Define messages/consumers
All messages and consumers are read through a schema file which is linked through
the `out` key in the config file.

### Messages
Each message contains a name and an Effect Schema that defines the payload of each message

Example message:
```ts
import { Schema } from "effect";
import { message } from "signalgraph";

export const OrderCreated = message({
  name: "orders.created",
  schema: Schema.Struct({
    orderId: Schema.String
  })
});
```

### Consumers
Each consumer contains a name and the message that consumer will consume & handle

Example consumer (using the message defined above):
```ts
# schema.ts
import { Schema } from "effect";
import { consumer } from "signalgraph";

export const Billing = consumer({
  name: "billing",
  message: OrderCreated
});
```

## Generate client
To generate the client from the config & your schema file, run this command in the ----------
of your project:
```bash
signalgraph generate
```

This will generate an `index.ts` file inside the directory you specified inside the
`out` field of the config file.

Each message and consumer is exposed as keys directly on the client. So using the
message & consumer above, the client would expose:
* `client.billing`
* `client.ordersCreated`

## Use client
To use the client after generating it within code just do:
```ts
const client = yield* makeClient;
yield* client.billing.handle(({ payload }) => Effect.gen(function* () {
  yield* Console.log("Billing received: ", payload);
  yield* client.billingCompleted.publish(payload);
}));
```
Then all defined messages and consumer will be available under `client.*`

## Publish
For each message defined in the schema the generated client exposes a publish function.
Using the message above the client would expose this function:

```ts
const client = yield* makeClient;
yield* client.ordersCreated.publish(payload);
```
That takes a argument for the payload which is the same as the defined schema of the message.

## Consume
For each consumer defined in the schema the generated client exposes a handle function.
Using the consumer above the client would expose this function:

```ts
const client = yield* makeClient;
yield* client.billing.handle(({ payload }) => Effect.gen(function* () {
  yield* Console.log("Billing received: ", payload);
}));
```
That takes a argument for the callback function that runs whenever that message
is published. It exposes a `payload` value which is typed to the consumer-specific message's schema

## Example

This example is a snippet of `examples/adapter-memory`

```ts
// schema.ts
import { Schema } from "effect";
import { consumer, message } from "signalgraph";

export const OrderCreated = message({
  name: "orders.created",
  schema: Schema.Struct({
    orderId: Schema.String
  })
});

export const BillingCompleted = message({
  name: "billing.completed",
  schema: Schema.Struct({
    orderId: Schema.String
  })
});

export const Billing = consumer({
  name: "billing",
  message: OrderCreated
});

export const Analytics = consumer({
  name: "analytics",
  message: OrderCreated
});

export const Email = consumer({
  name: "email",
  message: BillingCompleted
})
```
```ts
// index.ts
import { Console, Effect } from "effect";
import { makeClient } from "../generated/index.ts";

const program = Effect.gen(function* () {
  const client = yield* makeClient;
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

  yield* client.ordersCreated.publish({
    orderId: "123"
  });
});

Effect.runSync(program)
```

The example above generates this hierarchy:
```
orders.created
        │
        ▼
   billing
        │
 publishes billing.completed
        │
        ▼
      email

orders.created
        │
        ▼
    analytics
```

## Packages

| Package                      | Purpose              |
| ---------------------------- | -------------------- |
| `signalgraph`                  | CLI + schema DSL     |
| `@signalgraph/runtime`         | Runtime primitives   |
| `@signalgraph/adapter-memory`  | In-memory transport  |

## Roadmap

### Core

- [x] Schema DSL
- [x] Client generation
- [x] Memory adapter
- [ ] First production adapter

### Developer Experience

- [x] Watch mode
- [ ] Smarter watch mode
- [ ] Better diagnostics

### Tooling

- [ ] Graph visualization
- [ ] Interactive schema explorer
- [ ] Mermaid export
- [ ] Graphviz export

### Future

- [ ] DevTools

## License

MIT
