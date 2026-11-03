# @signalgraph/devtools

A SignalGraph integration to view the message flows through OTEL spans. It parses SignalGraph specific spans and creates a clean view of a message's lifecycle, from first publish to the last handler and/or publish (it tracks if the original message gets published as a another message).

## Installation

```sh
npm install signalgraph @signalgraph/devtools
```

## Links

- [Docs](https://signalgraph-docs.voffie.workers.dev): Documentation
- [Issues](https://github.com/voffie/signalgraph/issues): Report bugs and share feature requests
