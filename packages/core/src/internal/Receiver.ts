import { Effect } from "effect";

export interface Receiver {
  readonly messageName: string;
  readonly handler: (payload: unknown) => Effect.Effect<void>;
}
