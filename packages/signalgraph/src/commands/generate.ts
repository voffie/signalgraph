import { Console, Effect } from "effect";
import { Command } from "effect/unstable/cli";
import { register } from "tsx/esm/api";
import { loadConfig } from "../loadConfig.ts";
import { loadSchema } from "../loadSchema.ts";
import { generateClient } from "../generateClient.ts";
import { findProjectRoot } from "../findProjectRoot.ts";

export const generate = Command.make(
  "generate",
  {},
  Effect.fn(function* () {
    yield* Effect.acquireRelease(
      Effect.sync(() => register()),
      (unregister) => Effect.promise(() => unregister())
    );

    yield* Console.log("Generating client...");

    const project = yield* findProjectRoot();
    const loadedConfig = yield* loadConfig(project.configPath);
    const loadedSchema = yield* loadSchema(loadedConfig.schema);

    yield* generateClient(
      loadedConfig,
      loadedSchema
    );

    yield* Console.log("Successfully generated client!");
    yield* Console.log("Import from generated/signalgraph!");
  })
).pipe(
  Command.withDescription("Generate client from SignalGraph schema"),
);
