import type { Attribute } from "./types.js";

export function getAttribute(attributes: Array<Attribute>, key: string): string | undefined {
  return attributes.find((attribute) => attribute.key === key)?.value;
}
