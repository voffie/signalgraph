import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

import { NODE_WIDTH, NODE_HEIGHT, type PositionedGraphNode } from "./domain/layout";
import type { SearchField } from "./types";

export function cn(...inputs: Array<ClassValue>) {
  return twMerge(clsx(inputs));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WithoutChild<T> = T extends { child?: any } ? Omit<T, "child"> : T;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WithoutChildren<T> = T extends { children?: any } ? Omit<T, "children"> : T;
export type WithoutChildrenOrChild<T> = WithoutChildren<WithoutChild<T>>;
export type WithElementRef<T, U extends HTMLElement = HTMLElement> = T & { ref?: U | null };

export function capitalize(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function buildNmap(nodes: Array<PositionedGraphNode>): Record<string, PositionedGraphNode> {
  return Object.fromEntries(nodes.map((node) => [node.id, node]));
}

export function epath(src: PositionedGraphNode, tgt: PositionedGraphNode): string {
  const sx = src.x + NODE_WIDTH;
  const sy = src.y + NODE_HEIGHT / 2;

  const tx = tgt.x;
  const ty = tgt.y + NODE_HEIGHT / 2;

  const dx = Math.abs(tx - sx) * 0.48;

  return `M${sx} ${sy} C${sx + dx} ${sy} ${tx - dx} ${ty} ${tx} ${ty}`;
}

export function emid(src: PositionedGraphNode, tgt: PositionedGraphNode): { x: number; y: number } {
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
    y: 0.125 * sy + 0.375 * cy1 + 0.375 * cy2 + 0.125 * ty,
  };
}

export function fmtMs(ms: number): string {
  if (ms === 0) {
    return "—";
  }

  return ms < 1000 ? `${ms.toFixed(3)}ms` : `${(ms / 1000).toFixed(1)}s`;
}

export function matchSearch(node: PositionedGraphNode, q: string, field: SearchField): boolean {
  const ql = q.toLowerCase();
  const attrs = node.attributes;

  switch (field) {
    case "name":
      return node.label.toLowerCase().includes(ql);

    case "service":
      return attrs.some(
        (attribute) =>
          attribute.key === "service.name" && attribute.value.toLowerCase().includes(ql),
      );

    case "msg-id":
      return attrs.some(
        (attribute) =>
          attribute.key.includes("message_id") && attribute.value.toLowerCase().includes(ql),
      );

    case "corr-id":
      return attrs.some(
        (attribute) =>
          attribute.key.includes("correlation") && attribute.value.toLowerCase().includes(ql),
      );

    case "trace-id":
      return attrs.some(
        (attribute) =>
          attribute.key.includes("trace") && attribute.value.toLowerCase().includes(ql),
      );

    default:
      return [node.label, node.id, ...attrs.map((a) => a.value)]
        .join(" ")
        .toLowerCase()
        .includes(ql);
  }
}
