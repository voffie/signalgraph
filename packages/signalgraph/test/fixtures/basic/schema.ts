import { Schema } from "effect";
import { consumer } from "signalgraph/consumer";
import { message } from "signalgraph/message";

export const OrderCreated = message({
  name: "orders.created",
  schema: Schema.Struct({
    orderId: Schema.String
  })
});

export const Billing = consumer({
  name: "billing",
  message: OrderCreated
})
