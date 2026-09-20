import { env } from "$env/dynamic/private";
import Database from "better-sqlite3";

const DB_PATH = env.DATABASE_PATH ?? "signalgraph.db";

export const db = new Database(DB_PATH);
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
