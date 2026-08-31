import { Duration, Schema } from "effect";
import { consumer, message } from "signalgraph";

export const OrderCreated = message({
  name: "order.created",
  schema: Schema.Struct({
    orderId: Schema.Number
  })
});

export const OrderCompleted = message({
  name: "order.completed",
  schema: Schema.Struct({
    orderId: Schema.Number
  })
});

export const Analytics = consumer({
  name: "analytics",
  message: OrderCreated
});

export const Billing = consumer({
  name: "billing",
  message: OrderCreated
});

export const Shipping = consumer({
  name: "shipping",
  message: OrderCompleted
});

export const RetryingAnalytics = consumer({
  name: "retryingAnalytics",
  message: OrderCreated,
  retry: {
    type: "fixed",
    delay: Duration.millis(100),
    maxAttempts: 2
  }
});

export const DlqAnalytics = consumer({
  name: "dlqAnalytics",
  message: OrderCompleted,
  retry: {
    type: "fixed",
    delay: Duration.millis(100),
    maxAttempts: 2
  },
  dlq: true
})
