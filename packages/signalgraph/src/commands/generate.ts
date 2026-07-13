import { Console, Effect } from "effect";
import { Command } from "effect/unstable/cli";
import { register } from "tsx/esm/api";
import { loadConfig } from "../loadConfig.ts";
import { loadSchema } from "../loadSchema.ts";
import { generateClient } from "../generateClient.ts";

export const generate = Command.make(
  "generate",
  {},
  Effect.fn(function* () {
    const unregister = register();

    yield* Console.log("Generating client...");

    const loadedConfig = yield* loadConfig();
    const loadedSchema = yield* loadSchema(loadedConfig.config.schema);

    yield* generateClient(
      loadedConfig.project,
      loadedSchema
    );

    yield* Console.log("Successfully generated client!");
    yield* Console.log("Import from generated/signalgraph!");

    unregister();
  })
).pipe(
  Command.withDescription("Generate client from SignalGraph schema")
);
