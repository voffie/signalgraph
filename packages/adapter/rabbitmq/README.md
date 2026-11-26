# @signalgraph/adapter-rabbitmq

The RabbitMQ adapter connects a SignalGraph client to RabbitMQ and manages its exchanges, queues, and bindings.

## Installation

```sh
npm install effect signalgraph @signalgraph/adapter-rabbitmq
```

Provide `RabbitMQBroker({ url })` to the Effect that constructs and runs the generated client. Start the consumer application first so SignalGraph can declare the exchanges and queues before a separate publisher sends messages.

Delivery is at least once. Write handlers that can process a duplicate delivery without repeating its side effects. Configure retry and dead-letter behavior on the consumer declaration. A failed publish confirmation can leave delivery uncertain, so reconcile the intended operation before publishing it again.

Connection loss, channel recovery, and terminal delivery failures appear in the Effect logs. To include retry handoffs, provide `References.MinimumLogLevel` from `effect` with the value `"Debug"` to your application Effect.

## Links

- [Documentation](https://signalgraph-docs.voffie.workers.dev)
- [Report a bug or request a feature](https://github.com/voffie/signalgraph/issues)
