import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout } from "node:timers/promises";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

const cliPath = fileURLToPath(new URL("../../bin/signalgraph", import.meta.url));

async function waitFor(
  condition: () => Promise<boolean>,
  label: string,
  getDebug: () => Promise<string>,
  timeoutMs = 10_000
): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (await condition()) {
      return;
    }

    await setTimeout(50);
  }

  throw new Error(`Timed out: ${label}\n${await getDebug()}`);
}

async function waitForOutput(outputPath: string, needle: string, label: string, getDebug: () => string): Promise<void> {
  await waitFor(
    async () => {
      try {
        return (await readFile(outputPath, "utf-8")).includes(needle);
      } catch {
        return false;
      }
    },
    label,
    async () => getDebug()
  );
}

function schema(messageName: string): string {
  return `
  import { Schema } from "effect";
  import { consumer, message } from ${JSON.stringify(fileURLToPath(new URL("../../src/index.ts", import.meta.url)))};

  export const Client = message({
    name: "${messageName}",
    schema: Schema.Struct({
      orderId: Schema.String,
    }),
  });

  export const Billing = consumer({
    name: "billing",
    message: Client,
  });

  export const Audit = consumer({
    name: "audit-log",
    message: Client,
  });

  export const Then = consumer({
    name: "then",
    message: Client,
  });
  `;
}

describe("signalgraph generate --watch", () => {
  let directory = "";
  let child: ReturnType<typeof spawn> | undefined;

  afterEach(async () => {
    child?.kill("SIGTERM");

    if (child && child.exitCode === null) {
      await once(child, "exit");
    }

    if (directory) {
      await rm(directory, { recursive: true, force: true });
    }

    directory = "";
    child = undefined;
  });

  it.each([
    [
      "rejects a tag-only declaration",
      'export const Fake = { _tag: "Message", name: "fake" };',
      'Export "Fake" is not a message or consumer declaration'
    ],
    ["rejects colliding generated properties", schema("billing"), 'reserved or duplicate client property "billing"']
  ])("%s", async (_label, source, expectedError) => {
    directory = await mkdtemp(fileURLToPath(new URL("./invalid-", import.meta.url)));
    await writeFile(
      path.join(directory, "signalgraph.config.ts"),
      'export default { schema: "./schema.ts", out: "./generated" };'
    );
    await writeFile(path.join(directory, "schema.ts"), source);

    const result = spawnSync(process.execPath, ["--import", "tsx", cliPath, "generate"], {
      cwd: directory,
      encoding: "utf8",
      timeout: 5_000
    });

    expect(result.status).toBe(1);
    expect((result.stdout + result.stderr).replace(/\s+/g, " ")).toContain(expectedError);
  });

  it("regenerates after a schema edit and preserves publish and handler payload types", async () => {
    directory = await mkdtemp(fileURLToPath(new URL("./watch-", import.meta.url)));

    const configPath = path.join(directory, "signalgraph.config.ts");
    const schemaPath = path.join(directory, "schema.ts");
    const outputPath = path.join(directory, "generated", "index.ts");

    await writeFile(
      configPath,
      `
    import { defineConfig } from ${JSON.stringify(fileURLToPath(new URL("../../src/config/index.ts", import.meta.url)))};

    export default defineConfig({
      schema: "./schema.ts",
      out: "./generated",
    });
    `
    );

    await writeFile(schemaPath, schema("orders.created"));

    let output = "";
    child = spawn(process.execPath, ["--import", "tsx", cliPath, "generate", "--watch"], {
      cwd: directory,
      stdio: ["ignore", "pipe", "pipe"]
    });
    child.stdout?.on("data", (d) => (output += d));
    child.stderr?.on("data", (d) => (output += d));

    await waitForOutput(outputPath, "ordersCreated", "initial generation", () => output);

    await writeFile(schemaPath, schema("payments.created"));

    await waitForOutput(outputPath, "paymentsCreated", "regeneration after schema change", () => output);

    const checkPath = path.join(directory, "check.ts");
    await writeFile(
      checkPath,
      `
      import type { Client } from "./generated/index.ts";
      import { Effect } from "effect";

      export function check(client: Client) {
        client.paymentsCreated.publish({ orderId: "payment-1" });
        // @ts-expect-error The schema requires a string ID.
        client.paymentsCreated.publish({ orderId: 123 });
        client.billing.handle(({ payload }) => {
          payload.orderId.toUpperCase();
          return Effect.void;
        });
        client.auditLog.handle(({ payload }) => {
          payload.orderId.toUpperCase();
          return Effect.void;
        });
        client.then.handle(({ payload }) => {
          payload.orderId.toUpperCase();
          return Effect.void;
        });
        // @ts-expect-error Regeneration removes the old message property.
        client.ordersCreated;
      }
    `
    );

    const result = spawnSync(
      "pnpm",
      [
        "exec",
        "tsc",
        "--ignoreConfig",
        "--noEmit",
        "--strict",
        "--types",
        "node",
        "--skipLibCheck",
        "--module",
        "NodeNext",
        "--allowImportingTsExtensions",
        checkPath
      ],
      { cwd: directory, encoding: "utf8" }
    );

    expect(result.status, result.stdout + result.stderr).toBe(0);

    const newSchemaPath = path.join(directory, "replacement.ts");
    await writeFile(newSchemaPath, schema("refunds.created"));
    await writeFile(configPath, 'export default { schema: "./replacement.ts", out: "./generated" };');
    await waitForOutput(
      outputPath,
      "refundsCreated",
      "generation after the configured schema path changes",
      () => output
    );

    await writeFile(newSchemaPath, schema("refunds.completed"));
    await waitForOutput(outputPath, "refundsCompleted", "regeneration from the replacement watcher", () => output);
  });
});
