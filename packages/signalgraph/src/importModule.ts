import { Effect, Path } from "effect";

import { ModuleImportError } from "./errors.ts";

export const importModule = Effect.fn(function* (url: string) {
  const path = yield* Path.Path;

  const fileUrl = yield* path.toFileUrl(url);
  const module = yield* Effect.tryPromise({
    try: () => import(fileUrl.href),
    catch: (cause) =>
      new ModuleImportError({
        path: fileUrl.href,
        cause,
      }),
  });

  return module;
});
