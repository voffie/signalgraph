import { describe, expect, it } from "@effect/vitest";

import { type Consumer, type Message, createClient } from "@signalgraph/runtime";

type Order = {
  orderId: string;
};

const createTestClient = () =>
  createClient<{
    ordersCreated: Message<Order>;
    billing: Consumer<Order>;
    analytics: Consumer<Order>;
  }>({
    ordersCreated: ["analytics", "billing"]
  });

describe("createClient", () => {
  it("creates message resources", () => {
    const client = createTestClient();
    expect(client.ordersCreated).toBeDefined();
  });

  it("creates consumer resources", () => {
    const client = createTestClient();
    expect(client.billing).toBeDefined();
    expect(client.analytics).toBeDefined();
  });

  it("publish reaches consumer", () => {
    let received: Order | undefined;
    const client = createTestClient();

    client.billing.handle(({ payload }) => {
      received = payload;
    });

    client.ordersCreated.publish({
      orderId: "123"
    });

    expect(received).toEqual({
      orderId: "123"
    });
  });

  it("supports multiple consumers", () => {
    let analytics = false;
    let billing = false;
    const client = createTestClient();

    client.analytics.handle(() => {
      analytics = true;
    });

    client.billing.handle(() => {
      billing = true;
    });

    client.ordersCreated.publish({
      orderId: "123"
    });

    expect(analytics).toBe(true);
    expect(billing).toBe(true);
  });

  it("supports multiple handlers", () => {
    let output = 0;
    const client = createTestClient();

    client.analytics.handle(() => {
      output += 1;
    });

    client.analytics.handle(() => {
      output += 1;
    });

    client.ordersCreated.publish({
      orderId: "123"
    });

    expect(output).toBe(2);
  });

  it("ignores consumers without handlers", () => {
    const client = createTestClient();

    expect(() => client.ordersCreated.publish({ orderId: "123" })).not.toThrow();
  });
});
