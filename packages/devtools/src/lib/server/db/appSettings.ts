import { Option, Schema } from "effect";

import { getDb } from "./index";

const DEFAULT_GRAPH_LOOKBACK_SECONDS = 24 * 60 * 60;

const GRAPH_LOOKBACK_KEY = "graph_lookback_seconds";

const SettingRowSchema = Schema.Struct({ value: Schema.String });
const decodeSetting = Schema.decodeUnknownSync(SettingRowSchema);

function getValue(key: string): Option.Option<string> {
  const row = getDb().prepare("SELECT value FROM app_settings WHERE key = ?").get(key);

  return Option.map(Option.fromUndefinedOr(row), (value) => decodeSetting(value).value);
}

function setValue(key: string, value: string) {
  getDb()
    .prepare(
      `INSERT INTO app_settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    )
    .run(key, value);
}

/** Reads the saved trace search window, falling back to the default for invalid or missing values. */
export function getGraphLookbackSeconds(): number {
  const stored = getValue(GRAPH_LOOKBACK_KEY);

  if (Option.isNone(stored)) return DEFAULT_GRAPH_LOOKBACK_SECONDS;

  const parsed = Number(stored.value);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_GRAPH_LOOKBACK_SECONDS;
}

/** Stores a validated trace search window in seconds. */
export function saveGraphLookbackSeconds(seconds: number) {
  setValue(GRAPH_LOOKBACK_KEY, String(seconds));
}
