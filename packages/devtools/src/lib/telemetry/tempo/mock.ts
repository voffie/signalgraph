import type { ServiceSummary } from "$lib/domain/types";

import type { TempoSearchResponse } from "./types";

export const MOCK_TEMPO_SEARCH_RESPONSE: TempoSearchResponse = {
  traces: [
    {
      traceID: "4bf92f3577b34da6a3ce929d0e0e4736",
      rootServiceName: "order-service",
      rootTraceName: "signalgraph.publish",
      startTimeUnixNano: "1786475091593000000",
      durationMs: 4350,
    },
    {
      traceID: "7a1c9e2f6b3d4a5e8f9012345678abca",
      rootServiceName: "order-service",
      rootTraceName: "signalgraph.publish",
      startTimeUnixNano: "1786475001000000000",
      durationMs: 210,
    },
    {
      traceID: "9f8e7d6c5b4a39281706f5e4d3c2b1a0",
      rootServiceName: "checkout-service",
      rootTraceName: "signalgraph.publish",
      startTimeUnixNano: "1786474950000000000",
      durationMs: 98,
    },
  ],
};

// Placeholder only — no real metrics source wired up yet.
export const MOCK_SERVICE_SUMMARIES = [
  {
    name: "order-service",
    status: "healthy",
    requestRate: "42/min",
    errorRate: 0,
    latencyP50Ms: 18,
    lastSeen: Date.now(),
  },
  {
    name: "billing",
    status: "healthy",
    requestRate: "38/min",
    errorRate: 0.4,
    latencyP50Ms: 124,
    lastSeen: Date.now(),
  },
  {
    name: "email",
    status: "healthy",
    requestRate: "38/min",
    errorRate: 0,
    latencyP50Ms: 45,
    lastSeen: Date.now(),
  },
  {
    name: "fraud-detector",
    status: "failed",
    requestRate: "2/min",
    errorRate: 100,
    latencyP50Ms: 4200,
    lastSeen: Date.now(),
  },
] satisfies Array<ServiceSummary>;
