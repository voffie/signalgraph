import { moveListIndex } from "$lib/listNavigation";
import { describe, expect, it } from "vitest";

describe("moveListIndex", () => {
  it("moves down until the final item", () => {
    expect(moveListIndex(0, "down", 3)).toBe(1);
    expect(moveListIndex(2, "down", 3)).toBe(2);
  });

  it("moves up until the first item", () => {
    expect(moveListIndex(2, "up", 3)).toBe(1);
    expect(moveListIndex(0, "up", 3)).toBe(0);
  });

  it("returns zero for an empty list", () => {
    expect(moveListIndex(4, "down", 0)).toBe(0);
  });
});
