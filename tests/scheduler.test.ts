import { describe, expect, it } from "vitest";
import { generateSlots, planQueue, queueDaysLeft } from "@/lib/scheduler";
import { channel, NOW, seeded } from "./helpers";

describe("queue scheduler", () => {
  it("generates Pepito's daily 18:00 Madrid slots after now", () => {
    const db = seeded();
    const pepito = channel(db, "Pepito Alerta");
    const slots = generateSlots(pepito, db.queueRules, NOW, 3);
    expect(slots.map((s) => s.at.toISOString())).toEqual([
      "2026-10-12T16:00:00.000Z", "2026-10-13T16:00:00.000Z", "2026-10-14T16:00:00.000Z", "2026-10-15T16:00:00.000Z",
    ]);
  });

  it("assigns ready videos in upload order, skipping drafts and taken slots", () => {
    const db = seeded();
    const bioniche = channel(db, "Bioniche");
    const { plan } = planQueue({ channel: bioniche, rules: db.queueRules, videos: db.videos, posts: [], now: NOW, horizonDays: 14 });
    expect(plan).toHaveLength(2); // the third Bioniche video is a draft
    expect(plan[0].platforms).toEqual(["youtube", "tiktok", "instagram"]);
    // Mon 12 Oct 19:00 Madrid, then Wed 14 Oct
    expect(plan.map((p) => p.scheduledAt)).toEqual(["2026-10-12T17:00:00.000Z", "2026-10-14T17:00:00.000Z"]);
  });

  it("skips videos that expire before the next slot", () => {
    const db = seeded();
    const pepito = channel(db, "Pepito Alerta");
    const first = db.videos.find((v) => v.channelId === pepito.id)!;
    first.expiresAt = "2026-10-12T12:00:00Z";
    const { plan, skippedExpired } = planQueue({ channel: pepito, rules: db.queueRules, videos: db.videos, posts: [], now: NOW, horizonDays: 14 });
    expect(skippedExpired).toEqual([first.id]);
    expect(plan.map((p) => p.videoId)).not.toContain(first.id);
  });

  it("computes days of content left", () => {
    const db = seeded();
    expect(queueDaysLeft(channel(db, "Pepito Alerta"), db.queueRules, db.videos, db.posts, NOW)).toBe(3);
    // Bioniche: 2 ready videos at 3/week
    expect(queueDaysLeft(channel(db, "Bioniche"), db.queueRules, db.videos, db.posts, NOW)).toBe(4.6);
  });
});
