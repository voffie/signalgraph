import { defineConfig } from "signalgraph/config";
import { memory } from "@signalgraph/adapter-memory";

export default defineConfig({
  schema: "./src/schema/schema.ts",
  out: "./generated",
  broker: memory()
});
