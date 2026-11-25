# OpenTelemetry example

This example sends SignalGraph spans to Grafana Tempo and renders the flow in devtools.

From the repository root, run `pnpm install` and `pnpm build`. Then run these commands from this example directory:

```sh
pnpm generate
docker compose up -d
pnpm consume
```

Open `http://127.0.0.1:4300` and configure `http://localhost:3200` as the active Tempo connection. When the consumer is running, use a second terminal in the same directory to run `pnpm send`. Open the latest trace to see the publisher and handlers. The programs export spans to Tempo over OTLP HTTP on port `4318`.

Stop the consumer with Ctrl+C, then run `docker compose down`.
