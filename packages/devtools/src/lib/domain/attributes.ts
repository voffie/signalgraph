import type { Attribute } from "./types";

export function getAttribute(attributes: Array<Attribute>, key: string): string | undefined {
  return attributes.find((attribute) => attribute.key === key)?.value;
}
