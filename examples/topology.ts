import { Message, Consumer, Topology, Messaging } from "@signalgraph/core";
import { MemoryDriver } from "@signalgraph/memory";
import { Effect, Schema } from "effect";

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
