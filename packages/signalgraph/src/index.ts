import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Effect } from "effect";
import { Command } from "effect/unstable/cli";
import { generate } from "./commands/generate.ts";

const root = Command.make("signalgraph").pipe(
  Command.withDescription("SignalGraph CLI")
);

root.pipe(
  Command.withSubcommands([generate]),
  Command.run({
    version: "1.0.0"
  }),
  Effect.scoped,
  Effect.provide(NodeServices.layer),
  NodeRuntime.runMain
);
