import { Console, Effect, FileSystem, Option, Path, Stream } from "effect";
import { Command, Flag } from "effect/cli";
import { register } from "tsx/esm/api";

import { findProjectRoot } from "./findProjectRoot.ts";
import { generateClient } from "./generateClient.ts";
import { loadConfig } from "./loadConfig.ts";
import { loadSchema } from "./loadSchema.ts";

const loadProject = Effect.fn(function* () {
  const project = yield* findProjectRoot();
  const config = yield* loadConfig(project.configPath);

  return {
    project,
    config
  };
});

const generateProject = Effect.fn(function* ({ project, config }: Effect.Success<ReturnType<typeof loadProject>>) {
  yield* Effect.logDebug("Loading SignalGraph project schema").pipe(
    Effect.annotateLogs({ config: project.configPath, schema: config.schema, outputDir: config.out })
  );

  const schema = yield* loadSchema(config.schema);

  yield* generateClient(config, schema);

  const path = yield* Path.Path;
  const output = path.relative(project.root, path.join(config.out, "index.ts"));

  yield* Console.log(
    `Generated ${output} (${schema.messages.size} message definitions, ${schema.consumers.size} consumers).`
  );
});

/** Defines the `signalgraph generate` command and its optional watch mode. */
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

    const initial = yield* loadProject();
    yield* generateProject(initial);

    if (Option.isSome(watch)) {
      const fs = yield* FileSystem.FileSystem;

      yield* Console.log("Watching the SignalGraph config and schema for changes. Press Ctrl+C to stop.");

      // Each config revision owns its schema watcher, so changing the schema path releases the old watcher.
      yield* Stream.concat(
        Stream.succeed(initial),
        fs.watch(initial.project.configPath).pipe(
          Stream.mapEffect(() =>
            Effect.gen(function* () {
              const project = initial.project;
              const config = yield* loadConfig(project.configPath);

              return { project, config };
            })
          )
        )
      ).pipe(
        Stream.switchMap((current) =>
          Stream.concat(Stream.succeed(current), fs.watch(current.config.schema).pipe(Stream.map(() => current)))
        ),
        Stream.drop(1),
        Stream.runForEach(generateProject)
      );
    }
  })
).pipe(Command.withDescription("Generate client from SignalGraph schema"));
