# RabbitMQ Example

This example demonstrates how to use the RabbitMQ adapter with SignalGraph

## Getting started

1. Generate the SignalGraph client

```bash
pnpm generate
```

This runs the SignalGraph client generator using the configuration and schema to
produce the generated client used by the example.

**Make sure Docker is running, then continue with these steps.**

1. Start RabbitMQ

```bash
docker compose up -d
```

This starts a RabbitMQ broker that the example connects to.

2. Start the consumer application

```bash
pnpm consume
```

This starts the application and registers all consumer handlers.

3. Publish the first message

```bash
pnpm send
```

This publishes the initial message that starts the message flow.
