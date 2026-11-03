# SignalGraph

SignalGraph is a library for building event-driven, and type-safe messaging infrastructure in TypeScript. Define your schema in one place and apply it to any supported message broker.

## Installation

```sh
npm install signalgraph
```

## Links

- [Docs](https://signalgraph-docs.voffie.workers.dev): Documentation
- [Issues](https://github.com/voffie/signalgraph/issues): Report bugs and share feature requests

## Packages

This monorepo contains the base `SignalGraph` package along side packages for supported brokers as adapters and custom integrations for extra features. All packages follow the same version.

| Package                                                      | Description                         |
| ------------------------------------------------------------ | ----------------------------------- |
| [`signalgraph`](packages/signalgraph)                        | The core package (CLI + schema DSL) |
| [`@signalgraph/adapter-rabbitmq`](packages/adapter/rabbitmq) | RabbitMQ transport                  |
| [`@signalgraph/devtools`](packages/devtools)                 | Devtools integration                |

## License

MIT
