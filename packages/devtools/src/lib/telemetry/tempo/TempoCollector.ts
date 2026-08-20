import type { Trace } from "$lib/domain/types";
import type { TraceCollector } from "../collector";
import { MOCK_TEMPO_RESPONSE } from "./mock";
import { normalizeTrace } from "./normalize";

export class TempoCollector implements TraceCollector {
  readonly #url: string;

  constructor(url: string) {
    this.#url = url;
  }
  async collect(): Promise<Trace> {
    return normalizeTrace(MOCK_TEMPO_RESPONSE);
  }
}
