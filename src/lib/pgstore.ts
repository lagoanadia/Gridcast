import { Pool, type PoolClient } from "pg";
import type { Database } from "./types";

/**
 * Postgres persistence (Supabase, Neon, any Postgres). The whole app state is one jsonb row,
 * read and written under a row lock so two requests at once (a click and the scheduler tick) never overwrite each other.
 */
const ROW_ID = "main";

const DDL = [
  `create table if not exists gridcast_state (
     id text primary key,
     data jsonb not null,
     updated_at timestamptz not null default now()
   )`,
  // Row-level security on with no policies: the public API keys can't read it; the server connects with the owner role.
  `alter table gridcast_state enable row level security`,
];

export function connectionUrl(env: Record<string, string | undefined> = process.env): string | undefined {
  return env.POSTGRES_URL || env.POSTGRES_URL_NON_POOLING || env.DATABASE_URL || undefined;
}

/** Managed Postgres (Supabase) uses a certificate pg can't verify, so TLS is on but unverified; localhost has no TLS. */
export function poolConfig(url: string) {
  const u = new URL(url);
  const local = ["localhost", "127.0.0.1", "::1"].includes(u.hostname);
  for (const k of ["sslmode", "supa", "pgbouncer"]) u.searchParams.delete(k);
  return { connectionString: u.toString(), ssl: local ? undefined : { rejectUnauthorized: false }, max: 3, idleTimeoutMillis: 10_000, connectionTimeoutMillis: 10_000 };
}

export class PgStore {
  private pool: Pool;
  private ready: Promise<void> | null = null;

  constructor(url: string, private makeEmpty: () => Database) {
    this.pool = new Pool(poolConfig(url));
  }

  private init() {
    this.ready ??= (async () => {
      for (const sql of DDL) await this.pool.query(sql);
    })().catch((e) => { this.ready = null; throw e; });
    return this.ready;
  }

  async load(): Promise<Database> {
    await this.init();
    const r = await this.pool.query("select data from gridcast_state where id = $1", [ROW_ID]);
    return { ...this.makeEmpty(), ...(r.rows[0]?.data ?? {}) };
  }

  async mutate<T>(fn: (db: Database) => T | Promise<T>): Promise<T> {
    await this.init();
    const c: PoolClient = await this.pool.connect();
    try {
      await c.query("begin");
      const r = await c.query("select data from gridcast_state where id = $1 for update", [ROW_ID]);
      const db: Database = { ...this.makeEmpty(), ...(r.rows[0]?.data ?? {}) };
      const out = await fn(db);
      await c.query(
        `insert into gridcast_state (id, data) values ($1, $2::jsonb)
         on conflict (id) do update set data = excluded.data, updated_at = now()`,
        [ROW_ID, JSON.stringify(db)],
      );
      await c.query("commit");
      return out;
    } catch (e) {
      await c.query("rollback").catch(() => undefined);
      throw e;
    } finally {
      c.release();
    }
  }

  close() { return this.pool.end(); }
}
