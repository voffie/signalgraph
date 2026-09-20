import { TempoCollector } from "$lib/telemetry/traces/tempo/TempoCollector";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.fn();

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

const tempoTrace = {
  trace: {
    resourceSpans: [
      {
        resource: {
          attributes: [],
        },
        scopeSpans: [
          {
            scope: {
              name: "signalgraph",
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
                      stringValue: "message-1",
                    },
                  },
                  {
                    key: "signalgraph.message.name",
                    value: {
                      stringValue: "orders.created",
                    },
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
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

    await expect(collector.getTrace("missing-trace")).resolves.toBeNull();

    expect(fetchMock).toHaveBeenCalledWith("http://localhost:3200/api/v2/traces/missing-trace");
  });

  it("returns null when the latest-trace search finds no traces", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ traces: [] }));

    const collector = new TempoCollector("http://localhost:3200");

    await expect(collector.getLatestTrace(15 * 60)).resolves.toBeNull();

    expect(fetchMock).toHaveBeenCalledTimes(1);

    const searchUrl = new URL(fetchMock.mock.calls[0][0] as string);

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
              traceID: "latest-trace-id",
            },
          ],
        }),
      )
      .mockResolvedValueOnce(jsonResponse(tempoTrace));

    const collector = new TempoCollector("http://localhost:3200");

    const trace = await collector.getLatestTrace(15 * 60);

    expect(trace?.traceId).toBe("74726163652d31");
    expect(trace?.spans).toHaveLength(1);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "http://localhost:3200/api/v2/traces/latest-trace-id",
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
            startTimeUnixNano: "1000000",
          },
        ],
      }),
    );

    const collector = new TempoCollector("http://localhost:3200");

    await expect(
      collector.listTraces({
        start: 100,
        end: 200,
        service: ["orders"],
      }),
    ).resolves.toEqual([
      {
        traceId: "trace-1",
        rootService: "orders",
        rootOperation: "orders.created",
        durationMs: 42,
        startTime: 1,
      },
    ]);

    const searchUrl = new URL(fetchMock.mock.calls[0][0] as string);

    expect(searchUrl.searchParams.get("start")).toBe("100");
    expect(searchUrl.searchParams.get("end")).toBe("200");
    expect(searchUrl.searchParams.get("q")).toBe('{ resource.service.name = "orders" }');
  });

  it("throws when Tempo rejects a trace-list search", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}, 500));

    const collector = new TempoCollector("http://localhost:3200");

    await expect(
      collector.listTraces({
        start: 100,
        end: 200,
      }),
    ).rejects.toThrow("Tempo search failed: 500");
  });
});
