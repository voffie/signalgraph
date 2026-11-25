import { Effect, FileSystem, Path } from "effect";

import { ConfigNotFoundError } from "./CliErrors.ts";

/** A generation project rooted at the directory containing its config. */
export interface Project {
  root: string;
  configPath: string;
}

/** Finds the closest SignalGraph configuration above the working directory. */
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
      return yield* new ConfigNotFoundError({
        cwd: current,
        searched: "signalgraph.config.ts"
      });
    }

    current = parent;
  }
});
