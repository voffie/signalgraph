import { describe, expect, it } from "vitest";

import { moveListIndex } from "#lib/listNavigation.js";

describe("moveListIndex", () => {
  it.each([
    { index: 10, direction: "up", length: 3, expected: 1 },
    { index: -2, direction: "down", length: 3, expected: 1 },
    { index: 4, direction: "down", length: 0, expected: 0 }
  ] as const)(
    "recovers a stale index $index after filtering to $length rows",
    ({ index, direction, length, expected }) => {
      expect(moveListIndex(index, direction, length)).toBe(expected);
    }
  );
});
