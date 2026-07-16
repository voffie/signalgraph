import { Schema } from "effect";
import { message } from "signalgraph/message";
import { consumer } from "signalgraph/consumer";

export const Billing = consumer({
  name: "billing",
  message: message({
    name: "orders.created",
    schema: Schema.Struct({
      orderId: Schema.String
    })
  })
})
