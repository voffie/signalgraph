import { Schema } from "effect";
import { consumer, message } from "signalgraph";
import { createClient, type MessageGraph } from "signalgraph/runtime";

const OrderCreated = message({ name: "order.created", schema: Schema.Struct({ orderId: Schema.Number }) });
const Analytics = consumer({ name: "analytics", message: OrderCreated });

const Billing = consumer({
  name: "billing",
  message: OrderCreated,
  retry: { type: "exponential", initialDelay: "1500 millis", factor: 3, maxDelay: "3 seconds", maxAttempts: 3 }
});

/** Message graph for the Cloudflare broker tests. */
export const graph = {
  "order.created": { definition: OrderCreated, consumers: [Analytics, Billing] }
} satisfies MessageGraph;

/** Creates the typed client against the broker layer under test. */
export const Client = createClient(graph, ({ message, consumer }) => ({
  orderCreated: message("order.created", OrderCreated),
  analytics: consumer(Analytics),
  billing: consumer(Billing)
}));
