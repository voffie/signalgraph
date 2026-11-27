# @signalgraph/adapter-cloudflare

Publish and consume SignalGraph messages with Cloudflare Queues. Your Alchemy stack deploys the Worker, and the adapter declares the queues and consumer attachments from your SignalGraph schema.

## Installation

```sh
npm install signalgraph@^1.1.0 effect@^4.1.5 @signalgraph/adapter-cloudflare
npm install --save-dev alchemy@2.0.0-beta.87 @alchemy.run/cloudflare@2.0.0-beta.87 @cloudflare/workers-types@^5.20261123.1
```

Run `npx signalgraph generate` to generate `Client` and `messageGraph`.

## Worker setup

1. In your Alchemy stack, import `declareCloudflareQueues` from `@signalgraph/adapter-cloudflare/alchemy` and pass it `messageGraph`. Add the returned `workerBindings` to your Worker's environment, then call `attachConsumers(worker)`.
2. To publish from an HTTP handler, provide `cloudflareBrokerLayer(messageGraph, env)` to the Effect that uses the generated client.
3. In the Worker's `queue` handler, provide `cloudflareBatchBrokerLayer(messageGraph, env, batch)`. Register your handlers and call `client.start()` to process and settle the batch.

Configure retries and dead-letter handling on each consumer. Dead-letter queues are enabled by default. Cloudflare Queues deliver at least once, so write handlers that can process a duplicate without repeating its side effects.

## Links

- [Cloudflare Queues guide](https://signalgraph-docs.voffie.workers.dev/adapters/cloudflare/)
- [Runnable example](https://github.com/voffie/signalgraph/tree/main/examples/adapter-cloudflare)
- [Report a bug or request a feature](https://github.com/voffie/signalgraph/issues)
