import { Command } from "effect/unstable/cli";
import { Console, Effect } from "effect";
import { loadConfig } from "../project/loadConfig.ts";
import { register } from "tsx/esm/api";
import { loadSchema } from "../project/loadSchema.ts";

export const generate = Command.make(
  "generate",
  {},
  Effect.fn(function* () {
    const unregister = register();

    yield* Console.log("Called generate command!");

    const loadedConfig = yield* loadConfig();
    const loadedSchema = yield* loadSchema(loadedConfig.config.schema);

    yield* Console.log(loadedSchema);

    unregister();
  })
).pipe(
  Command.withDescription("Generate client from SignalGraph schema")
);
