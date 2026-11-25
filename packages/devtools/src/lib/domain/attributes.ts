import type { Attribute } from "./types.js";

/** Finds the first span attribute with the given telemetry key. */
export function getAttribute(attributes: Array<Attribute>, key: string): string | undefined {
  return attributes.find((attribute) => attribute.key === key)?.value;
}
