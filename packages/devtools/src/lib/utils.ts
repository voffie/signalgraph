import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

import { NODE_WIDTH, NODE_HEIGHT, type PositionedGraphNode } from "./domain/layout";
import type { SearchField } from "./types";

/** Combines Tailwind classes, preferring later classes when they conflict. */
export function cn(...inputs: Array<ClassValue>) {
  return twMerge(clsx(inputs));
}

/** Removes a component's single-child snippet from its props. */
export type WithoutChild<T> = T extends { child?: infer _Child } ? Omit<T, "child"> : T;

/** Removes a component's children snippet from its props. */
export type WithoutChildren<T> = T extends { children?: infer _Children } ? Omit<T, "children"> : T;

/** Removes both snippet props when a wrapper owns rendering them. */
export type WithoutChildrenOrChild<T> = WithoutChildren<WithoutChild<T>>;

/** Adds the bindable element reference used by Svelte UI wrappers. */
export type WithElementRef<T, U extends HTMLElement = HTMLElement> = T & { ref?: U | null };

/** Uppercases the first character for display. */
export function capitalize(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Indexes positioned nodes for edge endpoints. */
export function buildNmap(nodes: Array<PositionedGraphNode>): Record<string, PositionedGraphNode> {
  return Object.fromEntries(nodes.map((node) => [node.id, node]));
}

/** Builds the SVG path between the output and input edges of two nodes. */
export function epath(src: PositionedGraphNode, tgt: PositionedGraphNode): string {
  const sx = src.x + NODE_WIDTH;
  const sy = src.y + NODE_HEIGHT / 2;

  const tx = tgt.x;
  const ty = tgt.y + NODE_HEIGHT / 2;

  const dx = Math.abs(tx - sx) * 0.48;

  return `M${sx} ${sy} C${sx + dx} ${sy} ${tx - dx} ${ty} ${tx} ${ty}`;
}

/** Returns the midpoint used to place a label along the rendered edge. */
export function emid(src: PositionedGraphNode, tgt: PositionedGraphNode) {
  const sx = src.x + NODE_WIDTH;
  const sy = src.y + NODE_HEIGHT / 2;

  const tx = tgt.x;
  const ty = tgt.y + NODE_HEIGHT / 2;

  const dx = Math.abs(tx - sx) * 0.48;

  const cx1 = sx + dx;
  const cy1 = sy;

  const cx2 = tx - dx;
  const cy2 = ty;

  return {
    x: 0.125 * sx + 0.375 * cx1 + 0.375 * cx2 + 0.125 * tx,
    y: 0.125 * sy + 0.375 * cy1 + 0.375 * cy2 + 0.125 * ty
  };
}

/** Formats a timeline duration at millisecond or second precision. */
export function fmtMs(ms: number): string {
  if (ms === 0) {
    return "—";
  }

  return ms < 1000 ? `${ms.toFixed(3)}ms` : `${(ms / 1000).toFixed(1)}s`;
}

/** Matches node labels or telemetry identifiers against a case-insensitive graph search. */
export function matchSearch(node: PositionedGraphNode, q: string, field: SearchField): boolean {
  const ql = q.toLowerCase();
  const attrs = node.attributes;

  switch (field) {
    case "name":
      return node.label.toLowerCase().includes(ql);

    case "service":
      return attrs.some((attribute) => attribute.key === "service.name" && attribute.value.toLowerCase().includes(ql));

    case "msg-id":
      return attrs.some(
        (attribute) => attribute.key === "signalgraph.message.id" && attribute.value.toLowerCase().includes(ql)
      );

    case "corr-id":
      return attrs.some(
        (attribute) => attribute.key === "signalgraph.correlation.id" && attribute.value.toLowerCase().includes(ql)
      );

    case "trace-id":
      return node.traceId.toLowerCase().includes(ql);

    default:
      return [node.label, node.id, ...attrs.map((a) => a.value)].join(" ").toLowerCase().includes(ql);
  }
}
