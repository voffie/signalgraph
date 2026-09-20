import { db } from "./index";

const DEFAULT_GRAPH_LOOKBACK_SECONDS = 24 * 60 * 60;

const GRAPH_LOOKBACK_KEY = "graph_lookback_seconds";

function getValue(key: string): { value: string } | null {
  const row = db.prepare("SELECT value FROM app_settings WHERE key = ?").get(key) as {
    value: string;
  } | null;

  return row;
}

function setValue(key: string, value: string) {
  db.prepare(
    `INSERT INTO app_settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(key, value);
}

export function getGraphLookbackSeconds(): number {
  const row = getValue(GRAPH_LOOKBACK_KEY);

  if (!row) return DEFAULT_GRAPH_LOOKBACK_SECONDS;

  const parsed = Number(row.value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_GRAPH_LOOKBACK_SECONDS;
}

export function saveGraphLookbackSeconds(seconds: number) {
  setValue(GRAPH_LOOKBACK_KEY, String(seconds));
}
