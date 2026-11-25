import type { Layer } from "effect";

/** A scoped layer mounted while a client is listening. */
export type Integration = Layer.Layer<never>;
