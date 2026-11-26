# Cloudflare Queues example

One application-owned Worker publishes an order and receives it through two SignalGraph queues. SignalGraph generates both the typed client and the message graph from the schema. The Alchemy stack and Worker both import that graph.

```sh
pnpm --filter @signalgraph/adapter-cloudflare-example generate
cd examples/adapter-cloudflare
pnpm exec alchemy dev --stage local
```

Send `POST /orders` to the Worker URL printed by Alchemy. The example publishes a fixed order ID. Both consumers log the delivery. The demonstration endpoint accepts unauthenticated requests.

To deploy to a disposable Cloudflare stage, authenticate with `pnpm exec alchemy profile edit --add Cloudflare`, preview the stack with `pnpm exec alchemy plan --stage staging`, and apply it with `pnpm exec alchemy deploy --stage staging`. The example stores Alchemy state under `.alchemy` in the project.

The app owns `alchemy.run.ts`. It imports the generated `messageGraph` once and adds the queue bindings to its Worker. `signalgraph generate` writes the typed client, which the Worker imports for publishing and handler registration. The HTTP handler provides `cloudflareBrokerLayer(messageGraph, env)` to publish. The queue handler provides `cloudflareBatchBrokerLayer(messageGraph, env, batch)` and registers its handlers. Its call to `client.start()` processes and settles the batch.

Cloudflare supplies `env` on each invocation. The example uses Alchemy's `InferEnv` from the app's Worker declaration. Add app-specific bindings alongside `...queues.workerBindings` to have Alchemy infer those types too. For each consumer, the stack binds a native queue sender under `SIGNALGRAPH_QUEUE_<CONSUMER>` and the physical queue name under `SIGNALGRAPH_QUEUE_NAME_<CONSUMER>`. The adapter uses that name to match the queue reported on incoming batches.

This prototype assigns every consumer in the schema to the same Worker. A consumer gets a dead-letter queue by default. Set `dlq: false` to omit it, independently of retries. Cloudflare Queues deliver at least once. A publish to multiple queues can partially succeed, so reconcile delivery before repeating the logical publish.

`@signalgraph/adapter-cloudflare/alchemy` is a subpath of the adapter package. Install `alchemy` and `@alchemy.run/cloudflare` in the deploy project to use it. The Worker imports the package root for runtime code.
