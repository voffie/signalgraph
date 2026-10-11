import { describe, expect, it } from "@effect/vitest";
import * as Naming from "signalgraph/internal/naming";

describe("toPropertyName", () => {
  it("handles dots", () => expect(Naming.toPropertyName("orders.created")).toBe("ordersCreated"));

  it("handles dashes", () => expect(Naming.toPropertyName("orders-created")).toBe("ordersCreated"));

  it("handles underscores", () => expect(Naming.toPropertyName("orders_created")).toBe("ordersCreated"));

  it("handles prefixed numbers", () => expect(Naming.toPropertyName("123.orders")).toBe("_123Orders"));
});

describe("toTypeName", () => {
  it("handles dots", () => expect(Naming.toTypeName("orders.created")).toBe("OrdersCreated"));

  it("keeps capitalization from message name", () =>
    expect(Naming.toTypeName("companyA.billing.started")).toBe("CompanyABillingStarted"));
});
