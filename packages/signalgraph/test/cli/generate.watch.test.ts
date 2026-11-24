import { spawn } from "node:child_process";
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

  export const OrderCreated = message({
    name: "${messageName}",
    schema: Schema.Struct({
      orderId: Schema.String,
    }),
  });

  export const Billing = consumer({
    name: "billing",
    message: OrderCreated,
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

  it("regenerates after the schema file changes", async () => {
    directory = await mkdtemp(fileURLToPath(new URL("./fixtures/watch-", import.meta.url)));

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

    expect(await readFile(outputPath, "utf8")).toContain("paymentsCreated");
  });
});
