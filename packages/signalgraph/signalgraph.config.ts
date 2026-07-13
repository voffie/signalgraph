import { defineConfig } from "./src/index";

export default defineConfig({
  out: "out",
  schema: "./src/schema/schema.ts",
  broker: "broker"
})
