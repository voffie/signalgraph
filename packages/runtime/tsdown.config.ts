import { defineConfig } from "tsdown";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    broker: "src/broker.ts",
  },
  format: ["esm"],
  platform: "node",
  clean: true,
  sourcemap: true,
  dts: true,
  deps: {
    onlyBundle: []
  },
  treeshake: {
    moduleSideEffects: false
  },
  publint: "ci-only",
  attw: "ci-only",
  failOnWarn: "ci-only",
  exports: {
    customExports: (exports) => ({
      ...exports,
      "./package.json": "./package.json"
    })
  }
})
