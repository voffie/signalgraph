import { spawn, type ChildProcess } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { Effect, Layer } from "effect";

interface DevtoolsOptions {
  readonly port?: number;
  readonly host?: string;
  readonly databasePath?: string;
}

const waitForExit = (child: ChildProcess) =>
  Effect.callback<void>((resume) => {
    if (child.exitCode !== null || child.signalCode !== null) {
      return resume(Effect.void);
    }

    const onExit = () => resume(Effect.void);
    child.once("exit", onExit);

    return Effect.sync(() => void child.off("exit", onExit));
  });

/** Runs the bundled devtools server for the lifetime of its integration layer. */
export const Devtools = (options: DevtoolsOptions = {}): Layer.Layer<never> => {
  const { port = 4300, host = "127.0.0.1", databasePath = "./.signalgraph/devtools.db" } = options;

  const start = Effect.acquireRelease(
    Effect.sync(() => {
      const entry = fileURLToPath(new URL("./server.js", import.meta.url));

      const child = spawn(process.execPath, [entry], {
        env: {
          ...process.env,
          PORT: String(port),
          HOST: host,
          DATABASE_PATH: resolve(databasePath)
        },
        stdio: "inherit"
      });

      child.on("error", () => {
        Effect.runSync(Effect.logError("Could not start the devtools server. Check the local server configuration."));
      });
      child.on("exit", (code) => {
        if (code !== null && code !== 0) {
          Effect.runSync(
            Effect.logError("The devtools server exited unexpectedly. Check the server startup output.").pipe(
              Effect.annotateLogs({ exitCode: code })
            )
          );
        }
      });

      return child;
    }),
    (child) =>
      Effect.gen(function* () {
        child.kill("SIGTERM");

        yield* waitForExit(child).pipe(
          Effect.timeout("3 seconds"),
          Effect.catchTag("TimeoutError", () => Effect.sync(() => void child.kill("SIGKILL")))
        );
      })
  ).pipe(Effect.andThen(Effect.log(`Starting devtools at http://${host}:${port}`)));

  return Layer.effectDiscard(start);
};
