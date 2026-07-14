import { message } from "../message.ts";
import { consumer } from "../consumer.ts";
import { Schema } from "effect";

export const OrderCreated = message({
  name: "orders.created",
  schema: Schema.Struct({
    orderId: Schema.String,
    amount: Schema.Number,
    items: Schema.Array(
      Schema.Struct({
        id: Schema.String
      })
    )
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

// Need to figure out how this should work (is not collected as a message)
export const temp = consumer({
  name: "temp",
  message: message({
    name: "tempMessage",
    schema: Schema.Struct({
      temp: Schema.String
    })
  })
})
