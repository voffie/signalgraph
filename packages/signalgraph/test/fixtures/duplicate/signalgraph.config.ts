import { defineConfig } from "signalgraph/config";

export default defineConfig({
  out: "",
  schema: "./schema.ts",
  broker: {
    package: "@signalgraph/adapter-memory",
    layer: "MemoryBroker",
  },
});
