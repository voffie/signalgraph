import { NodeServices } from "@effect/platform-node";
import { Effect } from "effect";
import { Command } from "effect/unstable/cli";

import pkg from "../package.json" with { type: "json" };
import { generate } from "./commands/generate.ts";

const root = Command.make("signalgraph", {}).pipe(Command.withSubcommands([generate]));

const cli = Command.runWith(root, {
  version: pkg.version,
});

export const program = cli(process.argv.slice(2)).pipe(
  Effect.scoped,
  Effect.provide(NodeServices.layer),
);
