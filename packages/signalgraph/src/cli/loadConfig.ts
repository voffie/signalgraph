import { Effect, FileSystem, Path } from "effect";

import type { Config } from "../config/index.ts";
import { InvalidConfigExportError, NotEsmProjectError } from "./CliErrors.ts";
import { importModule } from "./importModule.ts";

const findNearestPackageJson = Effect.fn(function* (startDir: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  let current = startDir;

  while (true) {
    const candidate = path.join(current, "package.json");
    if (yield* fs.exists(candidate)) return candidate;

    const parent = path.dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
});

const assertEsmProject = Effect.fn(function* (configPath: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  const packageJsonPath = yield* findNearestPackageJson(path.dirname(configPath));

  if (packageJsonPath === undefined) {
    return yield* new NotEsmProjectError({ configPath, reason: "no package.json found" });
  }

  const text = yield* fs.readFileString(packageJsonPath);
  const pkg = yield* Effect.try({
    try: () => JSON.parse(text) as { type?: string },
    catch: () => new NotEsmProjectError({ configPath, reason: `${packageJsonPath} is not valid JSON` })
  });

  if (pkg.type !== "module") {
    return yield* new NotEsmProjectError({
      configPath,
      reason: `${packageJsonPath} has no "type": "module"`
    });
  }
});

export const loadConfig = Effect.fn(function* (configPath: string) {
  yield* assertEsmProject(configPath);

  const path = yield* Path.Path;
  const module = yield* importModule(configPath);

  if (!module.default) {
    return yield* new InvalidConfigExportError({
      path: configPath,
      reason: "Expected a default export."
    });
  }

  const data: Config = module.default;

  const configDir = path.dirname(configPath);

  return {
    ...data,
    schema: path.resolve(configDir, data.schema),
    out: path.resolve(configDir, data.out)
  };
});
