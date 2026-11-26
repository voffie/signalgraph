import { Schema } from "effect";
import { consumer, message } from "signalgraph";

/** Published when an order is created. */
export const OrderCreated = message({
  name: "order.created",
  schema: Schema.Struct({ orderId: Schema.Number })
});

/** Records a created order for analytics. */
export const Analytics = consumer({ name: "analytics", message: OrderCreated });

/** Bills a created order, allowing one retry after a transient failure. */
export const Billing = consumer({
  name: "billing",
  message: OrderCreated,
  retry: { type: "fixed", delay: "2 seconds", maxAttempts: 2 }
});
