import { getAttribute } from "./attributes";
import type { Graph, GraphEdge, GraphNode, Trace } from "./types";

export function buildGraph(trace: Trace): Graph {
  const nodes = new Map<string, GraphNode>();
  const edges = new Map<string, GraphEdge>();
  const spanNodeIds: Record<string, string> = {};

  const signalGraphSpans = trace.spans.filter((span) => span.name.startsWith("signalgraph."));

  for (const span of signalGraphSpans) {
    const spanKind = span.name.split(".")[1];

    switch (spanKind) {
      case "publish": {
        const messageId = getAttribute(span.attributes, "signalgraph.message.id");

        const messageName = getAttribute(span.attributes, "signalgraph.message.name");

        if (!messageId || !messageName) {
          continue;
        }

        nodes.set(messageId, {
          id: messageId,
          label: messageName,
          kind: "message",
          attributes: span.attributes,
          traceId: span.traceId,
          primarySpanId: span.spanId,
        });

        spanNodeIds[span.spanId] = messageId;
        break;
      }

      case "handler": {
        const consumerName = getAttribute(span.attributes, "signalgraph.consumer.name");

        if (!consumerName) {
          continue;
        }

        nodes.set(consumerName, {
          id: consumerName,
          label: consumerName,
          kind: "handler",
          attributes: span.attributes,
          traceId: span.traceId,
          primarySpanId: span.spanId,
        });

        spanNodeIds[span.spanId] = consumerName;
        break;
      }

      case "consume":
        const consumerName = getAttribute(span.attributes, "signalgraph.consumer.name");

        if (consumerName) {
          spanNodeIds[span.spanId] = consumerName;
        }
        break;

      default:
        continue; // unrecognized span kind - ignore rather than fail the whole trace
    }
  }

  const spansById = new Map(signalGraphSpans.map((span) => [span.spanId, span]));

  for (const span of signalGraphSpans) {
    const spanKind = span.name.split(".")[1];

    if (spanKind === "consume") {
      const messageId = getAttribute(span.attributes, "signalgraph.message.id");

      const consumerName = getAttribute(span.attributes, "signalgraph.consumer.name");

      if (!messageId || !consumerName) {
        continue;
      }

      edges.set(`${messageId}-${consumerName}`, {
        id: `${messageId}-${consumerName}`,
        source: messageId,
        target: consumerName,
      });
    }

    if (spanKind === "publish") {
      const messageId = getAttribute(span.attributes, "signalgraph.message.id");

      if (!messageId || !span.parentSpanId) {
        continue;
      }

      const parentSpan = spansById.get(span.parentSpanId);

      if (parentSpan?.name !== "signalgraph.handler") {
        continue;
      }

      const consumerName = getAttribute(parentSpan.attributes, "signalgraph.consumer.name");

      if (!consumerName) {
        continue;
      }

      edges.set(`${consumerName}-${messageId}`, {
        id: `${consumerName}-${messageId}`,
        source: consumerName,
        target: messageId,
      });
    }
  }

  return {
    nodes: [...nodes.values()],
    edges: [...edges.values()],
    traceSpans: signalGraphSpans,
    spanNodeIds,
  };
}
