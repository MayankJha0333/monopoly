/**
 * Persistent storage: accounts, sessions and match stats, in one SQLite file.
 * Uses Node's built-in `node:sqlite` (Node 22.13+), so there is no native
 * module to compile. Set DATA_DIR to put the file on a persistent volume.
 */
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const DATA_DIR = process.env.DATA_DIR ?? path.resolve(process.cwd(), 'data');
const FILE = process.env.DB_FILE ?? path.join(DATA_DIR, 'sunnyport.db');

export function openDb(file = FILE): DatabaseSync {
  if (file !== ':memory:') mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS users (
      id           TEXT PRIMARY KEY,
      username     TEXT UNIQUE COLLATE NOCASE,
      email        TEXT UNIQUE COLLATE NOCASE,
      pass_hash    TEXT,
      display_name TEXT NOT NULL,
      is_guest     INTEGER NOT NULL DEFAULT 1,
      token        TEXT NOT NULL DEFAULT 'hat',
      color        TEXT NOT NULL DEFAULT '#e8443a',
      xp           INTEGER NOT NULL DEFAULT 0,
      coins        INTEGER NOT NULL DEFAULT 0,
      games        INTEGER NOT NULL DEFAULT 0,
      wins         INTEGER NOT NULL DEFAULT 0,
      created_at   INTEGER NOT NULL,
      last_seen    INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id         TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS users_rank ON users(is_guest, wins DESC, xp DESC);
  `);
  return db;
}

export interface UserRow {
  id: string;
  username: string | null;
  email: string | null;
  pass_hash: string | null;
  display_name: string;
  is_guest: number;
  token: string;
  color: string;
  xp: number;
  coins: number;
  games: number;
  wins: number;
  created_at: number;
  last_seen: number;
}
