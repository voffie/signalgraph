import { Layer } from "effect";
import { FetchHttpClient } from "effect/http";
import { OtlpSerialization, OtlpTracer } from "effect/observability";

/** Exports Effect spans to Tempo over HTTP. Flushes pending spans when the application scope closes. */
export const traceExportLayer = (serviceName: string) =>
  OtlpTracer.layer({
    url: "http://localhost:4318/v1/traces",
    resource: { serviceName }
  }).pipe(Layer.provide(Layer.merge(FetchHttpClient.layer, OtlpSerialization.layerProtobuf)));
