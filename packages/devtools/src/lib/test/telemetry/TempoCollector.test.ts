import { Effect, Option } from "effect";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TempoCollector } from "#lib/telemetry/traces/tempo/TempoCollector.js";

const fetchMock = vi.fn();

function jsonResponse<T>(body: T, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json"
    }
  });
}

const tempoTrace = {
  trace: {
    resourceSpans: [
      {
        resource: {
          attributes: []
        },
        scopeSpans: [
          {
            scope: {
              name: "signalgraph"
            },
            spans: [
              {
                traceId: "dHJhY2UtMQ==",
                spanId: "c3Bhbi0x",
                name: "signalgraph.publish",
                startTimeUnixNano: "1000000",
                endTimeUnixNano: "2000000",
                attributes: [
                  {
                    key: "signalgraph.message.id",
                    value: {
                      stringValue: "message-1"
                    }
                  },
                  {
                    key: "signalgraph.message.name",
                    value: {
                      stringValue: "orders.created"
                    }
                  }
                ]
              }
            ]
          }
        ]
      }
    ]
  }
};

describe("TempoCollector", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("returns null when a requested trace does not exist", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}, 404));

    const collector = new TempoCollector("http://localhost:3200");

    await expect(Effect.runPromise(collector.getTrace("missing-trace"))).resolves.toEqual(Option.none());

    expect(fetchMock).toHaveBeenCalledWith("http://localhost:3200/api/v2/traces/missing-trace", expect.anything());
  });

  it("returns null when the latest-trace search finds no traces", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ traces: [] }));

    const collector = new TempoCollector("http://localhost:3200");

    await expect(Effect.runPromise(collector.getLatestTrace(15 * 60))).resolves.toEqual(Option.none());

    expect(fetchMock).toHaveBeenCalledTimes(1);

    const searchUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));

    expect(searchUrl.pathname).toBe("/api/search");
    expect(searchUrl.searchParams.get("q")).toBe("{} with (most_recent=true)");
    expect(searchUrl.searchParams.get("limit")).toBe("1");
  });

  it("searches for the latest trace and then fetches that trace", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          traces: [
            {
              traceID: "latest-trace-id"
            }
          ]
        })
      )
      .mockResolvedValueOnce(jsonResponse(tempoTrace));

    const collector = new TempoCollector("http://localhost:3200");

    const trace = Option.getOrThrow(await Effect.runPromise(collector.getLatestTrace(15 * 60)));

    expect(trace.traceId).toBe("74726163652d31");
    expect(trace.spans).toHaveLength(1);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "http://localhost:3200/api/v2/traces/latest-trace-id",
      expect.anything()
    );
  });

  it("normalizes listed trace summaries and sends service filters to Tempo", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        traces: [
          {
            traceID: "trace-1",
            rootServiceName: "orders",
            rootTraceName: "orders.created",
            durationMs: 42,
            startTimeUnixNano: "1000000"
          }
        ]
      })
    );

    const collector = new TempoCollector("http://localhost:3200");

    await expect(
      Effect.runPromise(
        collector.listTraces({
          start: 100,
          end: 200,
          service: ['orders "worker"', "payments\\worker"]
        })
      )
    ).resolves.toEqual([
      {
        traceId: "trace-1",
        rootService: "orders",
        rootOperation: "orders.created",
        durationMs: 42,
        startTime: 1
      }
    ]);

    const searchUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));

    expect(searchUrl.searchParams.get("start")).toBe("100");
    expect(searchUrl.searchParams.get("end")).toBe("200");
    expect(searchUrl.searchParams.get("q")).toBe(
      '{ (resource.service.name = "orders \\"worker\\"" || resource.service.name = "payments\\\\worker") }'
    );
  });

  it.each([
    [jsonResponse({}, 500), "Unavailable"],
    [jsonResponse({}, 403), "RejectedRequest"],
    [jsonResponse({ traces: [{ traceID: "missing-summary-fields" }] }), "InvalidResponse"]
  ])("classifies trace-list failures as %s", async (response, reason) => {
    fetchMock.mockResolvedValueOnce(response);

    const collector = new TempoCollector("http://localhost:3200");

    await expect(
      Effect.runPromise(
        collector.listTraces({
          start: 100,
          end: 200
        })
      )
    ).rejects.toMatchObject({ operation: "listTraces", reason });
  });
});
