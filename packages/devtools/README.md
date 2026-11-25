# @signalgraph/devtools

Devtools turns OpenTelemetry publish, consume, and handler spans into a message flow, including messages published by handlers. Grafana Tempo is the first supported trace backend.

![Message graph and timeline showing orders.created reaching Analytics and Billing, then Billing publishing billing.completed for Email](https://raw.githubusercontent.com/voffie/signalgraph/main/apps/docs/docs/integrations/images/trace_overview.png)

## Installation

```sh
npm install effect signalgraph @signalgraph/devtools
```

Configure an OpenTelemetry exporter to send traces to Tempo. Add `Devtools()` to `client.listen({ integrations: [Devtools()] })`, then open `http://127.0.0.1:4300` and select a Tempo connection in settings. Use Tempo's query HTTP URL (typically port `3200` for local development) for the connection. The OTLP ingestion endpoint is configured in the exporter.

The UI listens on loopback by default and stores settings in `./.signalgraph/devtools.db`. Keep it on a trusted interface. It displays application trace data.

Use **Refresh trace** to fetch again from the active connection. With a trace selected, this reloads that trace. On the default view, it fetches the latest trace. After a provider error, use **Retry trace**.

## Links

- [Devtools guide](https://signalgraph-docs.voffie.workers.dev/integrations/devtools/): Setup and trace inspection
- [Issues](https://github.com/voffie/signalgraph/issues): Report bugs and share feature requests
