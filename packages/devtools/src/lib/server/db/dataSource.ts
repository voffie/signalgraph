import type { CollectorConfig } from "$lib/telemetry/collector";

import { db } from "./index";

export function getDataSourceConfig(): CollectorConfig | null {
  const row = db.prepare("SELECT type, config FROM data_source WHERE id = 1").get() as
    | { type: string; config: string }
    | undefined;

  if (!row) return null;
  return { type: row.type, ...JSON.parse(row.config) } as CollectorConfig;
}

export function saveDataSourceConfig(config: CollectorConfig) {
  const { type, ...rest } = config;
  db.prepare(
    `INSERT INTO data_source (id, type, config) VALUES (1, ?, ?)
    ON CONFLICT(id) DO UPDATE SET type = excluded.type, config = excluded.config`,
  ).run(type, JSON.stringify(rest));
}

export function clearDataSourceConfig() {
  db.prepare("DELETE FROM data_source WHERE id = 1").run();
}
