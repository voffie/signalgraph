import type { GraphNode } from "./domain/types";

export type InspTab = 'overview' | 'attributes';
export type SearchField =
  | 'any'
  | 'name'
  | 'msg-id'
  | 'corr-id'
  | 'trace-id'
  | 'service';

export interface PositionedGraphNode extends GraphNode {
  x: number;
  y: number;
}
