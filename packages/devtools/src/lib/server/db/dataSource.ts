import type { TracesConfig, TraceVendor } from "$lib/telemetry/traces";

import { db } from "./index";

export type DataSourceProfile = {
  id: number;
  name: string;
  vendor: TraceVendor;
  config: TracesConfig;
  isActive: boolean;
};

type DataSourceRow = {
  id: number;
  name: string;
  vendor: string;
  config: string;
  is_active: number;
};

function rowToProfile(row: DataSourceRow): DataSourceProfile {
  return {
    id: row.id,
    name: row.name,
    vendor: row.vendor as TraceVendor,
    config: JSON.parse(row.config),
    isActive: row.is_active === 1,
  };
}

export function listDataSources(): Array<DataSourceProfile> {
  const rows = db
    .prepare("SELECT id, name, vendor, config, is_active FROM data_source ORDER BY name")
    .all() as Array<DataSourceRow>;

  return rows.map(rowToProfile);
}

export function getDataSourceByName(name: string): DataSourceProfile | null {
  const row = db
    .prepare("SELECT id, name, vendor, config, is_active FROM data_source WHERE name = ?")
    .get(name) as DataSourceRow | undefined;

  return row ? rowToProfile(row) : null;
}

export function getActiveDataSource(): DataSourceProfile | null {
  const row = db
    .prepare("SELECT id, name, vendor, config, is_active FROM data_source WHERE is_active = 1")
    .get() as DataSourceRow | undefined;

  return row ? rowToProfile(row) : null;
}

export function createDataSource(profile: Omit<DataSourceProfile, "id" | "isActive">) {
  db.prepare("INSERT INTO data_source (name, vendor, config) VALUES (?, ?, ?)").run(
    profile.name,
    profile.vendor,
    JSON.stringify(profile.config),
  );
}

export function updateDataSource(
  currentName: string,
  updates: Omit<DataSourceProfile, "id" | "isActive">,
) {
  db.prepare("UPDATE data_source SET name = ?, vendor = ?, config = ? WHERE name = ?").run(
    updates.name,
    updates.vendor,
    JSON.stringify(updates.config),
    currentName,
  );
}

export function deleteDataSource(name: string) {
  db.prepare("DELETE FROM data_source WHERE name = ?").run(name);
}

export function setActiveDataSource(name: string) {
  const run = db.transaction((n: string) => {
    db.prepare("UPDATE data_source SET is_active = 0 WHERE is_active = 1").run();
    db.prepare("UPDATE data_source SET is_active = 1 WHERE name = ?").run(n);
  });

  run(name);
}
