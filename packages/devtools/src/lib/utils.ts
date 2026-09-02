import type { PositionedGraphNode, SearchField } from './types';
import { NW, NH } from './tokens';
import type { ServiceSummary, TraceSummary } from './domain/types';

export function buildNmap(
  nodes: Array<PositionedGraphNode>
): Record<string, PositionedGraphNode> {
  return Object.fromEntries(nodes.map(node => [node.id, node]));
}

export function epath(
  src: PositionedGraphNode,
  tgt: PositionedGraphNode
): string {
  const sx = src.x + NW;
  const sy = src.y + NH / 2;

  const tx = tgt.x;
  const ty = tgt.y + NH / 2;

  const dx = Math.abs(tx - sx) * 0.48;

  return `M${sx} ${sy} C${sx + dx} ${sy} ${tx - dx} ${ty} ${tx} ${ty}`;
}

export function emid(
  src: PositionedGraphNode,
  tgt: PositionedGraphNode
): { x: number; y: number; } {
  const sx = src.x + NW;
  const sy = src.y + NH / 2;

  const tx = tgt.x;
  const ty = tgt.y + NH / 2;

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
    return '—';
  }

  return ms < 1000 ? `${ms.toFixed(3)}ms` : `${(ms / 1000).toFixed(1)}s`;
}

export function matchSearch(
  node: PositionedGraphNode,
  q: string,
  field: SearchField
): boolean {
  const ql = q.toLowerCase();
  const attrs = node.attributes;

  switch (field) {
    case 'name':
      return node.label.toLowerCase().includes(ql);

    case 'service':
      return attrs.some(
        (attribute) =>
          attribute.key === 'service.name' &&
          attribute.value.toLowerCase().includes(ql)
      );

    case 'msg-id':
      return attrs.some(
        (attribute) =>
          attribute.key.includes('message_id') &&
          attribute.value.toLowerCase().includes(ql)
      );

    case 'corr-id':
      return attrs.some(
        (attribute) =>
          attribute.key.includes('correlation') &&
          attribute.value.toLowerCase().includes(ql)
      );

    case 'trace-id':
      return attrs.some(
        (attribute) =>
          attribute.key.includes('trace') &&
          attribute.value.toLowerCase().includes(ql)
      );

    default:
      return [node.label, node.id, ...attrs.map(a => a.value)]
        .join(' ')
        .toLowerCase()
        .includes(ql);
  }
}

export function matchSearchTrace(
  trace: TraceSummary,
  q: string,
  field: SearchField
): boolean {
  const ql = q.toLowerCase();

  return true;
}

export function matchSearchService(
  service: ServiceSummary,
  q: string,
  field: SearchField
): boolean {
  const ql = q.toLowerCase();

  return true;
}
