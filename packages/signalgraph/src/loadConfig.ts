import { Effect, Path } from "effect";

import type { Config } from "./config.ts";
import { InvalidConfigExportError } from "./errors.ts";
import { importModule } from "./importModule.ts";

export const loadConfig = Effect.fn(function* (configPath: string) {
  const path = yield* Path.Path;
  const module = yield* importModule(configPath);

  if (!module.default) {
    return yield* new InvalidConfigExportError({
      path: configPath,
      reason: "Expected a default export.",
    });
  }

  const data: Config = module.default;

  const configDir = path.dirname(configPath);

  return {
    ...data,
    schema: path.resolve(configDir, data.schema),
    out: path.resolve(configDir, data.out),
  };
});
