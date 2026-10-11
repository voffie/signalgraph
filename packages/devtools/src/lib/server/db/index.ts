import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

import { DATABASE_PATH } from "$app/env/private";
import Database from "better-sqlite3";

let instance: Database.Database | undefined;

export function getDb(): Database.Database {
  if (instance) return instance;

  mkdirSync(dirname(DATABASE_PATH), { recursive: true });

  const db = new Database(DATABASE_PATH);
  db.pragma("journal_mode = WAL");

  db.exec(`CREATE TABLE IF NOT EXISTS data_source (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    vendor TEXT NOT NULL,
    config TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 0
  )`);

  db.exec(`CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`);

  instance = db;
  return db;
}
