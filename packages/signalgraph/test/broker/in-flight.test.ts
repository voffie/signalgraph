import { trackBrokerDeliveries } from "signalgraph/broker";
import { expect, it } from "vitest";

const orders = [
  [0, 1, 2],
  [0, 2, 1],
  [1, 0, 2],
  [1, 2, 0],
  [2, 0, 1],
  [2, 1, 0]
];

it.each(orders.map((order) => ({ order })))(
  "settles deliveries once in release order $order, including after channel recovery",
  ({ order }) => {
    const tracker = trackBrokerDeliveries();
    const releases = [tracker.enter(), tracker.enter(), tracker.enter()];

    for (const [step, delivery] of order.entries()) {
      const release = releases[delivery];
      release();
      release();
      expect(tracker.count()).toBe(2 - step);
    }

    const abandoned = tracker.enter();
    tracker.releaseAll();
    const current = tracker.enter();
    abandoned();
    expect(tracker.count()).toBe(1);
    current();
    expect(tracker.count()).toBe(0);
  }
);
