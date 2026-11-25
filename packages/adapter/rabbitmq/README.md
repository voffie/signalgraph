# @signalgraph/adapter-rabbitmq

A SignalGraph adapter for RabbitMQ. It exposes the adapter as a layer which gets provided to the main application.

## Installation

```sh
npm install effect signalgraph @signalgraph/adapter-rabbitmq
```

Provide `RabbitMQBroker({ url })` to the Effect that constructs and runs the generated client. Start the consumer application first so SignalGraph can declare the exchanges and queues before a separate publisher sends messages.

Delivery is at least once. Handlers should make their side effects idempotent. Configure retry and dead-letter behavior on the consumer declaration. A failed publish confirmation can leave delivery uncertain, so reconcile the intended operation before publishing it again.

Connection loss, channel recovery, and terminal delivery failures appear in the Effect logs. To include retry handoffs, provide `References.MinimumLogLevel` from `effect` with the value `"Debug"` to your application Effect.

## Links

- [Docs](https://signalgraph-docs.voffie.workers.dev): Documentation
- [Issues](https://github.com/voffie/signalgraph/issues): Report bugs and share feature requests
