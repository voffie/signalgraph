# RabbitMQ Example

This example publishes an order, handles it in Analytics, and forwards the completion to Shipping.

## Getting started

From the repository root, run `pnpm install` and `pnpm build`. Run the remaining commands from this example directory.

1. Generate the SignalGraph client

```bash
pnpm generate
```

This runs the SignalGraph client generator using the configuration and schema to
produce the generated client used by the example.

**Make sure Docker is running, then continue with these steps.**

2. Start RabbitMQ

```bash
docker compose up -d
```

This starts a RabbitMQ broker that the example connects to.

3. Start the consumer application

```bash
pnpm consume
```

This starts the application and registers all consumer handlers.

4. Publish the first message

```bash
pnpm send
```

This publishes the initial message that starts the message flow.

Stop the consumer with Ctrl+C, then run `docker compose down` to stop RabbitMQ.
