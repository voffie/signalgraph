import { Console, Effect, FileSystem, Option, Path, Stream } from "effect";
import { Command, Flag } from "effect/cli";
import { register } from "tsx/esm/api";

import * as CLI from "../cli/index.ts";

const loadProject = Effect.fn(function* () {
  const project = yield* CLI.findProjectRoot();
  const config = yield* CLI.loadConfig(project.configPath);

  return {
    project,
    config
  };
});

const generateProject = Effect.fn(function* () {
  const { project, config } = yield* loadProject();
  const schema = yield* CLI.loadSchema(config.schema);

  yield* CLI.generateClient(config, schema);

  const path = yield* Path.Path;

  const output = path.relative(project.root, path.join(config.out, "index.ts"));

  yield* Console.log(`✓ Generated ${output}`);
});

export const generate = Command.make(
  "generate",
  {
    watch: Flag.Boolean("watch").pipe(Flag.withAlias("w"), Flag.optional)
  },
  Effect.fn(function* ({ watch }) {
    yield* Effect.acquireRelease(
      Effect.sync(() => register()),
      (unregister) => Effect.promise(() => unregister())
    );

    const { project, config } = yield* loadProject();

    yield* generateProject();

    if (Option.isSome(watch)) {
      const fs = yield* FileSystem.FileSystem;
      // TODO: Restart watchers if the config changes the schema location.
      yield* Stream.merge(fs.watch(project.configPath), fs.watch(config.schema)).pipe(
        Stream.runForEach(() => generateProject())
      );
    }
  })
).pipe(Command.withDescription("Generate client from SignalGraph schema"));
