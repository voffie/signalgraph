import { MemoryBroker } from "@signalgraph/adapter-memory";
import { Console, Effect } from "effect";

import { Client } from "../generated/index.ts";

const program = Effect.gen(function* () {
  const client = yield* Client;

  yield* client.billing.handle(({ payload }) =>
    Effect.gen(function* () {
      yield* Console.log("Billing received: ", payload);
      yield* client.billingCompleted.publish(payload);
    })
  );

  yield* client.analytics.handle(({ payload }) => Console.log("Analytics received: ", payload));

  yield* client.email.handle(({ payload }) => Console.log("Email received: ", payload));

  yield* client.ordersCreated.publish({
    orderId: "123"
  });
});

Effect.runPromise(program.pipe(Effect.provide(MemoryBroker())));
