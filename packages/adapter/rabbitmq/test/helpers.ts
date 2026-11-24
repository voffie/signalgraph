import { Effect } from "effect";

import { Client } from "./fixtures/generated.ts";

export const makeClient = Effect.gen(function* () {
  const client = yield* Client;

  yield* Effect.all(
    [
      client.analytics.handle(() => Effect.void),
      client.billing.handle(() => Effect.void),
      client.retryingAnalytics.handle(() => Effect.void),
      client.noRetryAnalytics.handle(() => Effect.void),
      client.dlqAnalytics.handle(() => Effect.void)
    ],
    { discard: true }
  );

  return client;
});
