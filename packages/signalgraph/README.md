# `signalgraph`

SignalGraph generates a typed messaging client from Effect schemas. SignalGraph requires an ESM project with `"type": "module"`.

## Installation

```sh
npm install effect signalgraph
```

Define messages and consumers with `message()` and `consumer()`. Set the schema path in `signalgraph.config.ts` and run `npx signalgraph generate`. Import `Client` from the generated module and provide a broker adapter when you run it.

The generated module also exports a payload type for each message. Import one when a handler helper or another module needs to name that type. Inline publish and handler calls infer it directly from the schema.

Use `npx signalgraph generate --watch` when editing the config or schema. Add `--log-level debug` to see the resolved config, schema, and output paths.

## Links

- [Documentation](https://signalgraph-docs.voffie.workers.dev)
- [Report a bug or request a feature](https://github.com/voffie/signalgraph/issues)
