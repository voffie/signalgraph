import { Effect, FileSystem, Path } from "effect";

export interface Project {
  root: string;
  configPath: string;
}

export const findProjectRoot = Effect.fn(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  let current = process.cwd();

  while (true) {
    const configPath = path.join(current, "signalgraph.config.ts");

    if (yield* fs.exists(configPath)) {
      return {
        root: current,
        configPath
      };
    }

    const parent = path.dirname(current);

    if (parent === current) {
      return yield* Effect.fail(
        new Error("Could not find signalgraph.config.ts")
      );
    }

    current = parent;
  }
});
