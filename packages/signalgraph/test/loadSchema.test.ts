import { fileURLToPath } from "node:url";

import { NodeServices } from "@effect/platform-node";
import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { loadSchema } from "signalgraph/loadSchema";

const schemaPath = new URL("./fixtures/basic/schema.ts", import.meta.url);

describe("loadSchema", () => {
  it.effect("loads exported messages and consumers", () =>
    loadSchema(fileURLToPath(schemaPath)).pipe(
      Effect.provide(NodeServices.layer),
      Effect.tap((schema) =>
        Effect.sync(() => {
          expect(schema.messages).toHaveLength(1);
          expect(schema.consumers).toHaveLength(1);
          expect(schema.messageExportNames).toHaveLength(1);

          expect(schema.messageExportNames.has("orders.created")).toBe(true);
          expect(schema.messages.has("orders.created")).toBe(true);
          expect(schema.consumers.has("billing")).toBe(true);
        }),
      ),
    ),
  );
});
