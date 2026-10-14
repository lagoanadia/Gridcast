import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { connectionUrl, PgStore } from "./pgstore";
import type { Database } from "./types";

/**
 * Persistence. With POSTGRES_URL (or DATABASE_URL) set, the state lives in Postgres and survives deploys.
 * Without it, a local JSON file is used, which is fine for development but is wiped on Vercel.
 * Every row has userId and every accessor filters by it, mirroring the Supabase RLS policies in supabase/migrations.
 */
// On Vercel the deployment filesystem is read-only; only /tmp is writable (and not persistent).
export const DATA_DIR =
  process.env.GRIDCAST_DATA_DIR ?? (process.env.VERCEL ? "/tmp/gridcast" : path.join(process.cwd(), ".data"));
export const UPLOAD_DIR = path.join(DATA_DIR, "uploads");
const DB_FILE = path.join(DATA_DIR, "db.json");

export const emptyDb = (): Database => ({
  users: [], channels: [], templates: [], videos: [], posts: [], queueRules: [], metrics: [], notifications: [],
});

/** The single user of a local, login-less run. Real users get their own id from their Google account. */
export function devUserId(): string {
  return process.env.GRIDCAST_DEV_USER_ID ?? "00000000-0000-0000-0000-000000000001";
}

function loadFile(): Database {
  if (!existsSync(DB_FILE)) return emptyDb();
  return { ...emptyDb(), ...JSON.parse(readFileSync(DB_FILE, "utf8")) };
}

function saveFile(db: Database) {
  mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${DB_FILE}.tmp`;
  writeFileSync(tmp, JSON.stringify(db, null, 2));
  renameSync(tmp, DB_FILE);
}

let pg: PgStore | null | undefined;
function postgres(): PgStore | null {
  if (pg === undefined) {
    const url = connectionUrl();
    pg = url ? new PgStore(url, emptyDb) : null;
  }
  return pg;
}

/** Test hook: forget the cached backend so env changes take effect. */
export async function resetStoreForTests() {
  await pg?.close();
  pg = undefined;
}

export const storageMode = (): "postgres" | "file" => (connectionUrl() ? "postgres" : "file");

export async function loadDb(): Promise<Database> {
  return postgres() ? postgres()!.load() : loadFile();
}

// The file backend has no row locks, so changes are queued one after another within this process.
let fileQueue: Promise<unknown> = Promise.resolve();

/** Read-modify-write in one step. Safe against concurrent requests (row lock in Postgres, a queue for the file). */
export function mutate<T>(fn: (db: Database) => T | Promise<T>): Promise<T> {
  const store = postgres();
  if (store) return store.mutate(fn);
  const run = fileQueue.then(async () => {
    const db = loadFile();
    const out = await fn(db);
    saveFile(db);
    return out;
  });
  fileQueue = run.catch(() => undefined);
  return run;
}

/** Restrict a database snapshot to the rows a user owns (what RLS does in Postgres). */
export function scoped(db: Database, userId: string): Database {
  const own = <T extends { userId: string }>(rows: T[]) => rows.filter((r) => r.userId === userId);
  return {
    users: [], // other people's profiles are never exposed
    channels: own(db.channels), templates: own(db.templates), videos: own(db.videos), posts: own(db.posts),
    queueRules: own(db.queueRules), metrics: own(db.metrics), notifications: own(db.notifications),
  };
}

export const newId = () => randomUUID();
export const nowIso = () => new Date().toISOString();
