import { Context, Effect } from "effect";
import type * as Topology from "./Topology.ts";

export class Driver extends Context.Service<Driver, {
  readonly publish: (
    message: Topology.AnyMessage,
    payload: unknown
  ) => Effect.Effect<void>;

  readonly subscribe: (
    consumer: Topology.AnyConsumer
  ) => Effect.Effect<void>;
}>()("@signalgraph/Driver") { }
