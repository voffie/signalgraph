import { Effect, Path } from "effect";
import { importModule } from "./importModule.ts";
import { InvalidConfigError } from "./errors.ts";

export type Config = {
  schema: string;
  out: string;
  broker: string;
};

export const loadConfig = Effect.fn(function* (configPath: string) {
  const path = yield* Path.Path;
  const module = yield* importModule(configPath);

  if (!module.default) {
    return yield* new InvalidConfigError({
      path: configPath,
      reason: "Expected a default export."
    });
  }

  const data = module.default;

  const configDir = path.dirname(configPath);

  return {
    ...data,
    schema: path.resolve(configDir, data.schema),
    out: path.resolve(configDir, data.out)
  } as Config;
})
