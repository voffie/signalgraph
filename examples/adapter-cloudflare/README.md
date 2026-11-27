# Cloudflare Queues example

One application-owned Worker publishes an order and receives it through two SignalGraph queues. SignalGraph generates both the typed client and the message graph from the schema. The Alchemy stack and Worker both import that graph.

## Prepare the example

Run from the repository root.

```sh
pnpm install
pnpm --filter signalgraph build
pnpm --filter @signalgraph/adapter-cloudflare-example generate
cd examples/adapter-cloudflare
```

## Run locally

Run `pnpm run dev` to start the Worker and queues locally. Use the local URL Alchemy prints and watch the terminal for handler logs.

## Deploy to Cloudflare

Run `pnpm run deploy` to deploy the Worker and queues to the disposable `smoke` stage. If Alchemy reports missing or expired Cloudflare credentials, follow the command it prints and then rerun the deploy. Prefix the printed command with `pnpm exec` to use the example's version of Alchemy.

Use the `workers.dev` URL Alchemy prints. Open **Observability** → **Live logs** for the deployed Worker before sending the request.

When you finish, run `pnpm run destroy` from this directory. Keep the example's `.alchemy` state until cleanup completes so Alchemy can remove the Worker and queues.

## Send a test order

Use the URL Alchemy prints in either mode. For example, if the local Worker is on port 1337:

```sh
curl -i -X POST http://localhost:1337/orders
```

Expect HTTP `202` with `Order queued.` and look for `Analytics received an order` and `Billing received an order` in the logs. The example publishes a fixed order ID and accepts unauthenticated requests.

This example checks queue delivery through logs. To use Devtools with a local Worker, run Devtools and Tempo as separate local services and configure the Worker to export OpenTelemetry traces to Tempo. Devtools reads traces through Tempo's query URL.

## How the example works

The app owns `alchemy.run.ts`. It imports the generated `messageGraph` once and adds the queue bindings to its Worker. `signalgraph generate` writes the typed client, which the Worker imports for publishing and handler registration. The HTTP handler provides `cloudflareBrokerLayer(messageGraph, env)` to publish. The queue handler provides `cloudflareBatchBrokerLayer(messageGraph, env, batch)` and registers its handlers. Its call to `client.start()` processes and settles the batch.

Cloudflare supplies `env` on each invocation. The example uses Alchemy's `InferEnv` from the app's Worker declaration. Add app-specific bindings alongside `...queues.workerBindings` to have Alchemy infer those types too. For each consumer, the stack binds a native queue sender under `SIGNALGRAPH_QUEUE_<CONSUMER>` and the physical queue name under `SIGNALGRAPH_QUEUE_NAME_<CONSUMER>`. The adapter uses that name to match the queue reported on incoming batches.

This prototype assigns every consumer in the schema to the same Worker. A consumer gets a dead-letter queue by default. Set `dlq: false` to omit it, independently of retries. Cloudflare Queues deliver at least once. A publish to multiple queues can partially succeed, so reconcile delivery before repeating the logical publish.

`@signalgraph/adapter-cloudflare/alchemy` is a subpath of the adapter package. Install `alchemy` and `@alchemy.run/cloudflare` in the deploy project to use it. The Worker imports the package root for runtime code.
