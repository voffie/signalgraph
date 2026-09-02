import Database from "better-sqlite3";
import { env } from "$env/dynamic/private";

const DB_PATH = env.DATABASE_PATH ?? 'signalgraph.db';

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`CREATE TABLE IF NOT EXISTS data_source (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  type TEXT NOT NULL,
  config TEXT NOT NULL
)`)

