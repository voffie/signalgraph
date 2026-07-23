import { Schema } from "effect";
import { consumer, message } from "signalgraph";

export const Billing = consumer({
  name: "billing",
  message: message({
    name: "orders.created",
    schema: Schema.Struct({
      orderId: Schema.String
    })
  })
})
