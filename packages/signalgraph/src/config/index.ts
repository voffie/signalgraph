import type { Config } from "./schema.ts";

export type { Config } from "./schema.ts";

/** Defines a statically checked SignalGraph configuration for the CLI to load. */
export const defineConfig = (config: Config): Config => config;
