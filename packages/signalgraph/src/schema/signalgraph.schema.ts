import { Consumer, Message } from "signalgraph";
import { Schema } from "effect";

export const OrderCreated = Message.make({
  name: "orders.created",
  schema: Schema.Struct({
    orderId: Schema.String
  })
});

export const Billing = Consumer.make({
  name: "billing",
  message: OrderCreated
});

export const Inventory = Consumer.make({
  name: "inventory",
  message: OrderCreated
});

