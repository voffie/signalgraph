import { Effect, Schema } from "effect";
import * as Message from "@signalgraph/core/Message";
import * as Consumer from "@signalgraph/core/Consumer.ts";
import * as Topology from "@signalgraph/core/Topology.ts";
import * as Messaging from "@signalgraph/core/Messaging.ts";
import { MemoryDriver } from "@signalgraph/memory";

const OrderCreated = Message.make({
  name: "orders.created",
  schema: Schema.Struct({
    orderId: Schema.String
  })
});

const Billing = Consumer.make({
  name: "billing-order-created",
  message: OrderCreated,
  handler: (payload) => Effect.sync(() => {
    console.log("Billing got:", payload.orderId);
  })
});

const topology = Topology.make({ consumers: [Billing] });

const program = Effect.gen(function* () {
  yield* Messaging.start(topology);
  Effect.log(topology.graph());
});

Effect.runPromise(program.pipe(Effect.provide(MemoryDriver)))
