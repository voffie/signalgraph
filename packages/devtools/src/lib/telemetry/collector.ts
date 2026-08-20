import type { Trace } from "$lib/domain/types";

export interface TraceCollector {
  collect(): Promise<Trace>;
}

export type CollectorConfig =
  | {
    type: "tempo";
    url: string;
  };
