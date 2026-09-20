import { Schema } from "effect";
import { consumer, message } from "signalgraph";

export const OrderCreated = message({
  name: "orders.created",
  schema: Schema.Struct({
    orderId: Schema.String,
  }),
});

export const BillingCompleted = message({
  name: "billing.completed",
  schema: Schema.Struct({
    orderId: Schema.String,
  }),
});

export const Billing = consumer({
  name: "billing",
  message: OrderCreated,
});

export const Analytics = consumer({
  name: "analytics",
  message: OrderCreated,
});

export const Email = consumer({
  name: "email",
  message: BillingCompleted,
});
