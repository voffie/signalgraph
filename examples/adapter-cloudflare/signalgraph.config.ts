import { defineConfig } from "signalgraph/config";

export default defineConfig({
  schema: "./src/schema.ts",
  out: "./generated"
});
