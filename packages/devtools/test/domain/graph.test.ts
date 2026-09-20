import { buildGraph } from "$lib/domain/graph";
import type { Trace, TraceSpan } from "$lib/domain/types";
import { describe, expect, it } from "vitest";

function span(
  name: string,
  spanId: string,
  attributes: Record<string, string>,
  parentSpanId?: string,
): TraceSpan {
  return {
    name,
    spanId,
    traceId: "trace-1",
    parentSpanId,
    startTime: 0,
    endTime: 10,
    attributes: Object.entries(attributes).map(([key, value]) => ({ key, value })),
  };
}

describe("buildGraph", () => {
  it("maps SignalGraph spans back to their graph node IDs", () => {
    const trace: Trace = {
      traceId: "trace-1",
      resourceAttributes: [],
      spans: [
        span("signalgraph.publish", "publish-1", {
          "signalgraph.message.id": "message-1",
          "signalgraph.message.name": "orders.created",
        }),
        span("signalgraph.consume", "consume-1", {
          "signalgraph.message.id": "message-1",
          "signalgraph.consumer.name": "billing",
        }),
        span(
          "signalgraph.handler",
          "handler-1",
          {
            "signalgraph.consumer.name": "billing",
          },
          "consume-1",
        ),
        span(
          "signalgraph.publish",
          "publish-2",
          {
            "signalgraph.message.id": "message-2",
            "signalgraph.message.name": "billing.completed",
          },
          "handler-1",
        ),
      ],
    };

    const graph = buildGraph(trace);

    expect(graph.spanNodeIds).toEqual({
      "publish-1": "message-1",
      "consume-1": "billing",
      "handler-1": "billing",
      "publish-2": "message-2",
    });

    expect(graph.nodes.find((node) => node.id === "message-1")?.primarySpanId).toBe("publish-1");
    expect(graph.nodes.find((node) => node.id === "billing")?.primarySpanId).toBe("handler-1");

    expect(graph.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: "message-1", target: "billing" }),
        expect.objectContaining({ source: "billing", target: "message-2" }),
      ]),
    );
  });
});
