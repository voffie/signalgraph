# `signalgraph`

SignalGraph generates a type-safe messaging client from Effect schemas. The core package provides the declaration API, the generator, and the runtime contracts used by broker adapters and integrations. SignalGraph requires an ESM project with `"type": "module"`.

## Installation

```sh
npm install effect signalgraph
```

Define messages and consumers with `message()` and `consumer()`, then point `defineConfig()` at the schema in `signalgraph.config.ts`. Run `npx signalgraph generate` and import `Client` from the generated directory. Install a broker adapter to run it.

The generated module also exports a payload type for each message. Import one when a handler helper or another module needs to name that type. Inline publish and handler calls infer it directly from the schema.

Use `npx signalgraph generate --watch` when editing the config or schema. Add `--log-level debug` to see the resolved config, schema, and output paths.

## Links

- [Docs](https://signalgraph-docs.voffie.workers.dev): Documentation
- [Issues](https://github.com/voffie/signalgraph/issues): Report bugs and share feature requests
