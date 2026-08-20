import type { PositionedGraphNode } from "$lib/types";
import type { Graph, GraphNode } from "./types";

export const NODE_WIDTH = 172;
export const NODE_HEIGHT = 76;

const HORIZONTAL_GAP = 96;
const VERTICAL_GAP = 44;
const PADDING = 48;

export function positionGraphNodes(
  graph: Graph
): Array<PositionedGraphNode> {
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  const remainingIncoming = new Map(
    graph.nodes.map((node) => [node.id, 0])
  );
  const outgoing = new Map(
    graph.nodes.map((node) => [node.id, new Array<string>()])
  );

  for (const edge of graph.edges) {
    if (!nodesById.has(edge.source) || !nodesById.has(edge.target)) {
      continue;
    }

    outgoing.get(edge.source)?.push(edge.target);
    remainingIncoming.set(
      edge.target,
      (remainingIncoming.get(edge.target) ?? 0) + 1
    );
  }

  const levels = new Map<string, number>();
  const queue = graph.nodes
    .filter((node) => remainingIncoming.get(node.id) === 0)
    .map((node) => node.id);

  for (const nodeId of queue) {
    levels.set(nodeId, 0);
  }

  for (let index = 0; index < queue.length; index += 1) {
    const nodeId = queue[index];
    const level = levels.get(nodeId) ?? 0;

    for (const targetId of outgoing.get(nodeId) ?? []) {
      levels.set(targetId, Math.max(levels.get(targetId) ?? 0, level + 1));

      const nextIncoming = (remainingIncoming.get(targetId) ?? 1) - 1;
      remainingIncoming.set(targetId, nextIncoming);

      if (nextIncoming === 0) {
        queue.push(targetId);
      }
    }
  }

  const fallbackLevel = Math.max(0, ...levels.values()) + 1;

  for (const node of graph.nodes) {
    if (!levels.has(node.id)) {
      levels.set(node.id, fallbackLevel);
    }
  }

  const nodesByLevel = new Map<number, Array<GraphNode>>();

  for (const node of graph.nodes) {
    const level = levels.get(node.id) ?? fallbackLevel;
    const nodes = nodesByLevel.get(level) ?? [];

    nodes.push(node);
    nodesByLevel.set(level, nodes);
  }

  const positions = new Map<string, PositionedGraphNode>();

  for (const [level, nodes] of nodesByLevel) {
    for (const [row, node] of nodes.entries()) {
      positions.set(node.id, {
        ...node,
        x: PADDING + level * (NODE_WIDTH + HORIZONTAL_GAP),
        y: PADDING + row * (NODE_HEIGHT + VERTICAL_GAP)
      });
    }
  }

  return graph.nodes.map((node) => {
    const positionedNode = positions.get(node.id);

    if (!positionedNode) {
      throw new Error(`Unable to position graph node: ${node.id}`);
    }

    return positionedNode;
  });
}
