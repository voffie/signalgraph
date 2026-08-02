import { describe, expect, it } from "@effect/vitest";
import { toPropertyName, toTypeName } from "signalgraph/internal/naming";

describe("toPropertyName", () => {
  it("handles dots", () => expect(toPropertyName("orders.created"))
    .toBe("ordersCreated"));

  it("handles dashes", () => expect(toPropertyName("orders-created"))
    .toBe("ordersCreated"));

  it("handles underscores", () => expect(toPropertyName("orders_created"))
    .toBe("ordersCreated"));

  it("handles prefixed numbers", () => expect(toPropertyName("123.orders"))
    .toBe("_123Orders"));
});

describe("toTypeName", () => {
  it("handles dots", () => expect(toTypeName("orders.created"))
    .toBe("OrdersCreated"));

  it("keeps capitalization from message name", () => expect(toTypeName("companyA.billing.started"))
    .toBe("CompanyABillingStarted"));
})
