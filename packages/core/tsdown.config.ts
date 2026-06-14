import { defineConfig } from "tsdown";

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/Consumer.ts",
    "src/Driver.ts",
    "src/Envelope.ts",
    "src/Message.ts",
    "src/Metadata.ts",
    "src/Topology.ts",
  ],
  format: ["esm"],
  clean: true,
  sourcemap: true,
  dts: true
})
