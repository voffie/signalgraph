import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout } from "node:timers/promises";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

const cliPath = fileURLToPath(new URL("../bin/signalgraph", import.meta.url));

async function waitFor(condition: () => Promise<boolean>, timeoutMs = 10_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (await condition()) {
      return;
    }

    await setTimeout(50);
  }

  throw new Error("Timed out waiting for generated client to update.");
}

function schema(messageName: string): string {
  return `
  import { Schema } from "effect";
  import { consumer } from ${JSON.stringify(
    fileURLToPath(new URL("../src/consumer.ts", import.meta.url)),
  )};
  import { message } from ${JSON.stringify(
    fileURLToPath(new URL("../src/message.ts", import.meta.url)),
  )};

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
  });

  it("regenerates after the schema file changes", async () => {
    directory = await mkdtemp(fileURLToPath(new URL("./fixtures/watch-", import.meta.url)));

    const configPath = path.join(directory, "signalgraph.config.ts");
    const schemaPath = path.join(directory, "schema.ts");
    const outputPath = path.join(directory, "generated", "index.ts");

    await writeFile(
      configPath,
      `
      import { defineConfig } from ${JSON.stringify(
        fileURLToPath(new URL("../src/config.ts", import.meta.url)),
      )};

      export default defineConfig({
        schema: "./schema.ts",
        out: "./generated",
        broker: {
          package: "@signalgraph/adapter-memory",
          layer: "MemoryBroker",
        },
      });
      `,
    );

    await writeFile(schemaPath, schema("orders.created"));

    child = spawn(process.execPath, ["--import", "tsx", cliPath, "generate", "--watch"], {
      cwd: directory,
      stdio: "ignore",
    });

    await waitFor(async () => {
      try {
        return (await readFile(outputPath, "utf8")).includes("ordersCreated");
      } catch {
        return false;
      }
    });

    await writeFile(schemaPath, schema("payments.created"));

    await waitFor(async () => {
      try {
        return (await readFile(outputPath, "utf8")).includes("paymentsCreated");
      } catch {
        return false;
      }
    });

    expect(await readFile(outputPath, "utf8")).toContain("paymentsCreated");
  });
});
