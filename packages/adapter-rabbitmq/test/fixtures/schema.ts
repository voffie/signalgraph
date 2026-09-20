import { Schema } from "effect";
import { consumer, message } from "signalgraph";

export const OrderCreated = message({
  name: "order.created",
  schema: Schema.Struct({
    orderId: Schema.Number,
  }),
});

export const OrderCompleted = message({
  name: "order.completed",
  schema: Schema.Struct({
    orderId: Schema.Number,
  }),
});

export const Analytics = consumer({
  name: "analytics",
  message: OrderCreated,
});

export const Billing = consumer({
  name: "billing",
  message: OrderCreated,
});

export const Shipping = consumer({
  name: "shipping",
  message: OrderCompleted,
});
