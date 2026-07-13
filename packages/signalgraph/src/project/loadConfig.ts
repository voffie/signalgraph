import { Effect, Path } from "effect";
import { findProjectRoot } from "./findProjectRoot.ts";
import { importModule } from "./importModule.ts";

export type Config = {
  schema: string;
  out: string;
  broker: string;
};

export const loadConfig = Effect.fn(function* () {
  const path = yield* Path.Path;
  const project = yield* findProjectRoot();
  const module = yield* importModule(project.configPath);

  if (!module.default) {
    return yield* Effect.fail(
      new Error(
        "signalgraph.config.ts must have a default export."
      )
    );
  }

  const data = module.default as Config;

  return {
    project,
    config: {
      ...module,
      schema: path.resolve(project.root, data.schema),
      out: path.resolve(project.root, data.schema)
    }
  };
})
