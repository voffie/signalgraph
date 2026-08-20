import { defineConfig } from "signalgraph/config";
import { rabbitmq } from "@signalgraph/adapter-rabbitmq";

export default defineConfig({
  schema: "./src/schema/schema.ts",
  out: "./generated",
  broker: rabbitmq()
});
