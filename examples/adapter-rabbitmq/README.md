# RabbitMQ example

Analytics handles the order message and publishes a completion message that Shipping handles.

## Getting started

From the repository root, run `pnpm install` and `pnpm build`. Run the remaining commands from this example directory.

Start Docker. Generate the client, start RabbitMQ, and run the consumer:

```sh
pnpm generate
docker compose up -d
pnpm consume
```

Wait for the consumer to log that it has declared the RabbitMQ topology. Publish the order from a second terminal in this directory:

```sh
pnpm send
```

Stop the consumer with Ctrl+C, then run `docker compose down` to stop RabbitMQ.
