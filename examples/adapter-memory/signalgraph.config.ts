import { defineConfig } from "signalgraph/config";

export default defineConfig({
  schema: "./src/schema/schema.ts",
  out: "./generated",
});
