import { Command } from "effect/unstable/cli";
import { Console, Effect } from "effect";
import { loadConfig } from "../project/loadConfig.ts";
import { register } from "tsx/esm/api";

export const generate = Command.make(
  "generate",
  {},
  Effect.fn(function* () {
    yield* Console.log("Called generate command!");
    const unregister = register();
    const loaded = yield* loadConfig();

    yield* Console.log(loaded.config);
    unregister();
  })
).pipe(
  Command.withDescription("Generate client from SignalGraph schema")
);
