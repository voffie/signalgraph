import { Effect, Path } from "effect";

export const importModule = Effect.fn(function* (url: string) {
  const path = yield* Path.Path;

  const fileUrl = yield* path.toFileUrl(url);
  const module = yield* Effect.tryPromise({
    try: () => import(fileUrl.href),
    catch: (e) => new Error(`Failed to load module: ${e}`)
  });

  return module;
})
