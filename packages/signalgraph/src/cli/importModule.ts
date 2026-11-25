import { Effect, Path } from "effect";

import { ModuleImportError } from "./CliErrors.ts";

let reload = 0;

/** Imports a fresh module namespace from a user-provided project file. */
export const importModule = Effect.fn(function* (url: string) {
  const path = yield* Path.Path;

  const fileUrl = yield* path.toFileUrl(url);
  fileUrl.searchParams.set("signalgraphReload", String(++reload));

  const module = yield* Effect.tryPromise({
    // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- Dynamic import supplies the untrusted module namespace.
    try: (): Promise<Readonly<Record<string, unknown>>> => import(fileUrl.href),
    catch: (cause) =>
      new ModuleImportError({
        path: fileUrl.href,
        cause
      })
  });

  return module;
});
