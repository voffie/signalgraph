import { Effect, FileSystem, Option, Path, Schema } from "effect";

import { decodeConfig, type Config } from "../config/schema.ts";
import { InvalidConfigExportError, NotEsmProjectError } from "./CliErrors.ts";
import { importModule } from "./importModule.ts";

const decodePackageJson = Schema.decodeEffect(
  Schema.fromJsonString(Schema.Struct({ type: Schema.OptionFromOptionalKey(Schema.String) }))
);

const findNearestPackageJson = Effect.fn(function* (startDir: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  let current = startDir;

  while (true) {
    const candidate = path.join(current, "package.json");

    if (yield* fs.exists(candidate)) return Option.some(candidate);

    const parent = path.dirname(current);

    if (parent === current) return Option.none();
    current = parent;
  }
});

const assertEsmProject = Effect.fn(function* (configPath: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  const packageJsonPath = yield* findNearestPackageJson(path.dirname(configPath));

  if (Option.isNone(packageJsonPath)) {
    return yield* new NotEsmProjectError({ configPath, reason: 'Add a package.json with "type": "module".' });
  }

  const text = yield* fs.readFileString(packageJsonPath.value);

  const packageType = yield* decodePackageJson(text).pipe(
    Effect.catchTag("SchemaError", () =>
      Effect.fail(
        new NotEsmProjectError({
          configPath,
          reason: `Correct ${packageJsonPath.value} to be a JSON object with "type": "module".`
        })
      )
    )
  );

  if (!Option.contains(packageType.type, "module")) {
    return yield* new NotEsmProjectError({
      configPath,
      reason: `Set "type": "module" in ${packageJsonPath.value}.`
    });
  }
});

/** Loads an ESM project config and resolves its paths relative to the config file. */
export const loadConfig = Effect.fn(function* (configPath: string) {
  yield* assertEsmProject(configPath);

  const path = yield* Path.Path;
  const module = yield* importModule(configPath);

  if (!("default" in module)) {
    return yield* new InvalidConfigExportError({
      path: configPath,
      reason: "Expected a default export."
    });
  }

  const data: Config = yield* decodeConfig(module.default, configPath);

  const configDir = path.dirname(configPath);

  return {
    ...data,
    schema: path.resolve(configDir, data.schema),
    out: path.resolve(configDir, data.out)
  };
});
