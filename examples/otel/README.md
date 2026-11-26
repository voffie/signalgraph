# OpenTelemetry example

The publisher and consumer export spans to Grafana Tempo. Devtools displays those spans in a graph and a timeline.

From the repository root, run `pnpm install` and `pnpm build`. Then run these commands from this example directory:

```sh
pnpm generate
docker compose up -d
pnpm consume
```

Open `http://127.0.0.1:4300` and configure `http://localhost:3200` as the active Tempo connection. When the consumer is running, run `pnpm send` in a second terminal in this directory. Open the latest trace to see the publisher and handlers. Both processes send spans over HTTP to Tempo's OpenTelemetry Protocol endpoint on port `4318`.

Stop the consumer with Ctrl+C, then run `docker compose down`.
