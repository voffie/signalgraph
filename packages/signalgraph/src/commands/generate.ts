import { Console, Effect, FileSystem, Path, Stream } from "effect";
import { Command, Flag } from "effect/unstable/cli";
import { register } from "tsx/esm/api";

import { findProjectRoot } from "../findProjectRoot.ts";
import { generateClient } from "../generateClient.ts";
import { loadConfig } from "../loadConfig.ts";
import { loadSchema } from "../loadSchema.ts";

const loadProject = Effect.fn(function* () {
  const project = yield* findProjectRoot();
  const config = yield* loadConfig(project.configPath);

  return {
    project,
    config,
  };
});

const generateProject = Effect.fn(function* () {
  const { project, config } = yield* loadProject();
  const schema = yield* loadSchema(config.schema);

  yield* generateClient(config, schema);

  const path = yield* Path.Path;

  const output = path.relative(project.root, path.join(config.out, "index.ts"));

  yield* Console.log(`✓ Generated ${output}`);
});

export const generate = Command.make(
  "generate",
  {
    watch: Flag.boolean("watch").pipe(Flag.withAlias("w")),
  },
  Effect.fn(function* ({ watch }) {
    yield* Effect.acquireRelease(
      Effect.sync(() => register()),
      (unregister) => Effect.promise(() => unregister()),
    );

    const { project, config } = yield* loadProject();

    yield* generateProject();

    if (watch) {
      const fs = yield* FileSystem.FileSystem;
      // TODO: Restart watchers if the config changes the schema location.
      yield* Stream.merge(fs.watch(project.configPath), fs.watch(config.schema)).pipe(
        Stream.runForEach(() => generateProject()),
      );
    }
  }),
).pipe(Command.withDescription("Generate client from SignalGraph schema"));
