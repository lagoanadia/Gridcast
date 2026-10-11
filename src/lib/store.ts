import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Database } from "./types";

/**
 * Phase 1 persistence: a local JSON file so the app runs with zero setup.
 * Every row has userId and every accessor filters by it, mirroring the Supabase
 * RLS policies in supabase/migrations. Phase 1b swaps this file for a Supabase adapter.
 */
// On Vercel the deployment filesystem is read-only; only /tmp is writable (and not persistent).
export const DATA_DIR =
  process.env.GRIDCAST_DATA_DIR ?? (process.env.VERCEL ? "/tmp/gridcast" : path.join(process.cwd(), ".data"));
export const UPLOAD_DIR = path.join(DATA_DIR, "uploads");
const DB_FILE = path.join(DATA_DIR, "db.json");

export const emptyDb = (): Database => ({
  channels: [], templates: [], videos: [], posts: [], queueRules: [], metrics: [], notifications: [],
});

export function currentUserId(): string {
  return process.env.GRIDCAST_DEV_USER_ID ?? "00000000-0000-0000-0000-000000000001";
}

export function loadDb(): Database {
  if (!existsSync(DB_FILE)) return emptyDb();
  return { ...emptyDb(), ...JSON.parse(readFileSync(DB_FILE, "utf8")) };
}

export function saveDb(db: Database) {
  mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${DB_FILE}.tmp`;
  writeFileSync(tmp, JSON.stringify(db, null, 2));
  renameSync(tmp, DB_FILE);
}

/** Read-modify-write in one synchronous step (safe within a single Node process). */
export function mutate<T>(fn: (db: Database) => T): T {
  const db = loadDb();
  const out = fn(db);
  saveDb(db);
  return out;
}

/** Restrict a database snapshot to the rows a user owns (what RLS does in Postgres). */
export function scoped(db: Database, userId: string): Database {
  const own = <T extends { userId: string }>(rows: T[]) => rows.filter((r) => r.userId === userId);
  return {
    channels: own(db.channels), templates: own(db.templates), videos: own(db.videos), posts: own(db.posts),
    queueRules: own(db.queueRules), metrics: own(db.metrics), notifications: own(db.notifications),
  };
}

export const newId = () => randomUUID();
export const nowIso = () => new Date().toISOString();
