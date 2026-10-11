import { NextResponse } from "next/server";
import { deliver } from "@/lib/alerts";
import { getPublisher } from "@/lib/publisher";
import { checkLowQueue, fillQueue, runDuePublishes } from "@/lib/services";
import { loadDb, saveDb } from "@/lib/store";

/**
 * One scheduler tick: fill queues, publish what's due (with retries), raise alerts.
 * Call every minute from cron (Vercel Cron, Supabase pg_cron, or `curl` locally) with
 * header `Authorization: Bearer $CRON_SECRET`. Phase 2 moves this to Inngest.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const now = new Date();
  const db = loadDb();
  const before = new Set(db.notifications.map((n) => n.id));
  const users = Array.from(new Set(db.channels.map((c) => c.userId)));
  let proposed = 0;
  for (const u of users) proposed += fillQueue(db, u, now);
  const published = await runDuePublishes(db, getPublisher(), now, (v) => v.filePath ?? "");
  for (const u of users) checkLowQueue(db, u, now);
  for (const n of db.notifications.filter((x) => !before.has(x.id))) n.channel = await deliver(n);
  saveDb(db);
  return NextResponse.json({ proposed, published: published.filter((r) => r.ok).length, failed: published.filter((r) => !r.ok).length });
}
