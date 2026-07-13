import { message } from "../message.ts";
import { consumer } from "../consumer.ts";
import { Schema } from "effect";

export const OrderCreated = message({
  name: "orders.created",
  schema: Schema.Struct({
    orderId: Schema.String
  })
});

export const Billing = consumer({
  name: "billing",
  message: OrderCreated
});

export const Inventory = consumer({
  name: "inventory",
  message: OrderCreated
});
