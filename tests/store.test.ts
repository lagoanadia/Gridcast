import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { connectionUrl, poolConfig } from "@/lib/pgstore";

const PG = process.env.TEST_DATABASE_URL;

async function freshStore(env: Record<string, string | undefined>) {
  vi.resetModules();
  for (const k of ["POSTGRES_URL", "POSTGRES_URL_NON_POOLING", "DATABASE_URL", "GRIDCAST_DATA_DIR"]) vi.stubEnv(k, env[k] ?? "");
  return import("@/lib/store");
}

describe("connection settings", () => {
  it("prefers the pooled URL and ignores empty values", () => {
    expect(connectionUrl({ POSTGRES_URL: "a", POSTGRES_URL_NON_POOLING: "b", DATABASE_URL: "c" })).toBe("a");
    expect(connectionUrl({ POSTGRES_URL: "", DATABASE_URL: "c" })).toBe("c");
    expect(connectionUrl({})).toBeUndefined();
  });
  it("turns TLS on, unverified, for remote hosts and drops sslmode", () => {
    const remote = poolConfig("postgres://u:p@db.abc.supabase.co:6543/postgres?sslmode=require&supa=base-pooler.x");
    expect(remote.ssl).toEqual({ rejectUnauthorized: false });
    expect(remote.connectionString).not.toContain("sslmode");
    expect(poolConfig("postgres://u:p@127.0.0.1:5432/x").ssl).toBeUndefined();
  });
});

describe("file store", () => {
  let dir = "";
  beforeEach(() => { dir = mkdtempSync(path.join(tmpdir(), "gc-")); });
  afterEach(() => { vi.unstubAllEnvs(); rmSync(dir, { recursive: true, force: true }); });

  it("persists changes and runs concurrent changes one after another", async () => {
    const s = await freshStore({ GRIDCAST_DATA_DIR: dir });
    expect(s.storageMode()).toBe("file");
    await Promise.all(Array.from({ length: 20 }, (_, i) => s.mutate((db) => { db.notifications.push({ id: String(i), userId: "u", createdAt: "", kind: "low_queue", message: "m", channel: "in_app", read: false }); })));
    expect((await s.loadDb()).notifications).toHaveLength(20);
  });
});

describe.skipIf(!PG)("postgres store", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("creates its table, persists, and never loses concurrent changes", async () => {
    const s = await freshStore({ POSTGRES_URL: PG });
    expect(s.storageMode()).toBe("postgres");
    await s.mutate((db) => { db.notifications.length = 0; });
    await Promise.all(Array.from({ length: 25 }, (_, i) => s.mutate(async (db) => {
      await new Promise((r) => setTimeout(r, 5)); // widen the race window
      db.notifications.push({ id: String(i), userId: "u", createdAt: "", kind: "low_queue", message: "m", channel: "in_app", read: false });
    })));
    expect((await s.loadDb()).notifications).toHaveLength(25);
    await s.resetStoreForTests();
  });

  it("rolls back when a change throws", async () => {
    const s = await freshStore({ POSTGRES_URL: PG });
    await s.mutate((db) => { db.notifications.length = 0; });
    await expect(s.mutate((db) => { db.notifications.push({ id: "x", userId: "u", createdAt: "", kind: "low_queue", message: "m", channel: "in_app", read: false }); throw new Error("boom"); })).rejects.toThrow("boom");
    expect((await s.loadDb()).notifications).toHaveLength(0);
    await s.resetStoreForTests();
  });
});
