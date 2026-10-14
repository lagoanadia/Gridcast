import { NextResponse } from "next/server";
import { deliver } from "@/lib/alerts";
import { getPublisher } from "@/lib/publisher";
import { checkLowQueue, fillQueue, runDuePublishes } from "@/lib/services";
import { refreshDueTokens } from "@/lib/instagram-tokens";
import { mediaUrlFor } from "@/lib/media";
import { mutate } from "@/lib/store";

/**
 * One scheduler tick: fill queues, publish what's due (with retries), raise alerts.
 * Call every minute from cron (Vercel Cron, Supabase pg_cron, or `curl` locally) with
 * header `Authorization: Bearer $CRON_SECRET`. Phase 2 moves this to Inngest.
 */
// Publishing to Instagram waits for the video to be processed, so this can take a while.
export const maxDuration = 60;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const now = new Date();
  const out = await mutate(async (db) => {
    const before = new Set(db.notifications.map((n) => n.id));
    const users = Array.from(new Set(db.channels.map((c) => c.userId)));
    let proposed = 0;
    for (const u of users) proposed += fillQueue(db, u, now);
    const published = await runDuePublishes(db, getPublisher(), now, mediaUrlFor);
    const renewed = await refreshDueTokens(db, now);
    for (const u of users) checkLowQueue(db, u, now);
    for (const n of db.notifications.filter((x) => !before.has(x.id))) n.channel = await deliver(n);
    return { proposed, renewed, published: published.filter((r) => r.ok).length, failed: published.filter((r) => !r.ok).length };
  });
  return NextResponse.json(out);
}
