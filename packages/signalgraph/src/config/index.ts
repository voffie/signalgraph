import { Schema } from "effect";

import { InvalidConfigError } from "../cli/CliErrors.ts";

const ConfigSchema = Schema.Struct({
  schema: Schema.String,
  out: Schema.String
});

export type Config = typeof ConfigSchema.Type;

export function defineConfig(config: unknown): Config {
  try {
    return Schema.decodeUnknownSync(ConfigSchema)(config);
  } catch (cause) {
    throw new InvalidConfigError({ cause });
  }
}
