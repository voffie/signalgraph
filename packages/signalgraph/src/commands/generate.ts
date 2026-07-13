import { Command } from "effect/unstable/cli";
import { Console, Effect } from "effect";
import { findProjectRoot } from "../project/findProjectRoot.ts";

export const generate = Command.make(
  "generate",
  {},
  Effect.fn(function* () {
    yield* Console.log("Called generate command!");

    const projectRoot = yield* findProjectRoot();

    yield* Console.log(projectRoot);

    /*    const path = "../src/schema/signalgraph.schema.ts";
    
        const fs = yield* FileSystem.FileSystem;
        const exists = yield* fs.exists(path);
        if (!exists) {
          yield* Console.error(`Schema file not found: ${path}`);
          return yield* Effect.fail(new Error(`Schema file not found: ${path}`));
        }
    
        const content = yield* fs.readFileString(path);
    
        yield* Console.log(`Read schema from ${path} (${content.length} bytes)`);
    
        yield* Console.log(`Content from file: ${content}`);
    
        // TODO: parse `content` and generate client*/
  })
).pipe(
  Command.withDescription("Generate client from SignalGraph schema")
);
