import { Effect, Schema } from "effect";

import { InvalidConfigExportError } from "../cli/CliErrors.ts";

const ConfigSchema = Schema.Struct({
  schema: Schema.NonEmptyString,
  out: Schema.NonEmptyString
});

const decodeConfigExport = Schema.decodeUnknownEffect(ConfigSchema);

/** Represents the paths required to generate a SignalGraph client. */
export type Config = typeof ConfigSchema.Type;

/** Decodes the default export of an externally loaded SignalGraph configuration module. */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- This is the configuration module's untrusted import boundary.
export const decodeConfig = (input: unknown, configPath: string) =>
  decodeConfigExport(input).pipe(
    Effect.catchTag("SchemaError", () =>
      Effect.fail(
        new InvalidConfigExportError({
          path: configPath,
          reason: 'Set "schema" and "out" to nonempty paths in the default export.'
        })
      )
    )
  );
