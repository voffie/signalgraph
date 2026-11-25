import { Option, Schema } from "effect";

import type { TracesConfig, TraceVendor } from "#lib/telemetry/traces/index.js";

import { getDb } from "./index";

/** A saved trace connection and whether it is selected. */
export type DataSourceProfile = {
  id: number;
  name: string;
  vendor: TraceVendor;
  config: TracesConfig;
  isActive: boolean;
};

const TraceVendorSchema = Schema.Literal("tempo");
const TracesConfigSchema = Schema.Struct({ url: Schema.String });

const DataSourceRowSchema = Schema.Struct({
  id: Schema.Int,
  name: Schema.String,
  vendor: TraceVendorSchema,
  config: Schema.String,
  is_active: Schema.Literals([0, 1])
});

const decodeRow = Schema.decodeUnknownSync(DataSourceRowSchema);
const decodeConfig = Schema.decodeSync(Schema.fromJsonString(TracesConfigSchema));

function rowToProfile(row: typeof DataSourceRowSchema.Type): DataSourceProfile {
  return {
    id: row.id,
    name: row.name,
    vendor: row.vendor,
    config: decodeConfig(row.config),
    isActive: row.is_active === 1
  };
}

/** Lists saved connections in name order. */
export function listDataSources(): Array<DataSourceProfile> {
  const rows = getDb().prepare("SELECT id, name, vendor, config, is_active FROM data_source ORDER BY name").all();

  return rows.map((row) => rowToProfile(decodeRow(row)));
}

/** Looks up a saved connection by its unique name. */
export function getDataSourceByName(name: string): Option.Option<DataSourceProfile> {
  const row = getDb().prepare("SELECT id, name, vendor, config, is_active FROM data_source WHERE name = ?").get(name);

  return Option.map(Option.fromUndefinedOr(row), (value) => rowToProfile(decodeRow(value)));
}

/** Looks up the currently selected connection, if one exists. */
export function getActiveDataSource(): Option.Option<DataSourceProfile> {
  const row = getDb().prepare("SELECT id, name, vendor, config, is_active FROM data_source WHERE is_active = 1").get();

  return Option.map(Option.fromUndefinedOr(row), (value) => rowToProfile(decodeRow(value)));
}

/** Saves a connection without changing the active selection. */
export function createDataSource(profile: Omit<DataSourceProfile, "id" | "isActive">) {
  getDb()
    .prepare("INSERT INTO data_source (name, vendor, config) VALUES (?, ?, ?)")
    .run(profile.name, profile.vendor, JSON.stringify(profile.config));
}

/** Updates a connection by its existing name, preserving the active selection. */
export function updateDataSource(currentName: string, updates: Omit<DataSourceProfile, "id" | "isActive">) {
  getDb()
    .prepare("UPDATE data_source SET name = ?, vendor = ?, config = ? WHERE name = ?")
    .run(updates.name, updates.vendor, JSON.stringify(updates.config), currentName);
}

/** Removes the named connection, clearing the selection if it was active. */
export function deleteDataSource(name: string) {
  getDb().prepare("DELETE FROM data_source WHERE name = ?").run(name);
}

/** Selects a connection atomically. Returns false and preserves the selection if the name is unknown. */
export function setActiveDataSource(name: string): boolean {
  const run = getDb().transaction((n: string) => {
    if (getDb().prepare("SELECT 1 FROM data_source WHERE name = ?").get(n) === undefined) return false;

    getDb().prepare("UPDATE data_source SET is_active = 0 WHERE is_active = 1").run();
    getDb().prepare("UPDATE data_source SET is_active = 1 WHERE name = ?").run(n);

    return true;
  });

  return run(name);
}
