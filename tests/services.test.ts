import { beforeEach, describe, expect, it } from "vitest";
import { DryRunPublisher } from "@/lib/publisher/dry-run";
import { approvePost, checkLowQueue, fillQueue, movePost, runDuePublishes } from "@/lib/services";
import { channel, NOW, seeded, USER } from "./helpers";

const media = () => "file://test";

describe("queue → approve → publish (dry run)", () => {
  let db: ReturnType<typeof seeded>;
  beforeEach(() => { db = seeded(); });

  it("fills the queue with proposed posts and never publishes them without approval", async () => {
    expect(fillQueue(db, USER, NOW)).toBe(3 * 2 + 2 * 3); // 3 Pepito videos × 2 platforms, 2 Bioniche × 3
    expect(db.posts.every((p) => p.status === "proposed")).toBe(true);
    const later = new Date("2026-11-30T00:00:00Z");
    expect(await runDuePublishes(db, new DryRunPublisher(), later, media)).toEqual([]);
  });

  it("publishes approved posts when due and marks the video published", async () => {
    fillQueue(db, USER, NOW);
    const pepito = channel(db, "Pepito Alerta");
    const first = db.posts.filter((p) => p.channelId === pepito.id).slice(0, 2);
    first.forEach((p) => expect(approvePost(db, USER, p.id)).toEqual({ ok: true }));
    const res = await runDuePublishes(db, new DryRunPublisher(), new Date("2026-10-12T16:00:01Z"), media);
    expect(res).toHaveLength(2);
    expect(first.every((p) => p.status === "published" && p.dryRun && p.externalId?.startsWith("dry_"))).toBe(true);
    expect(db.videos.find((v) => v.id === first[0].videoId)!.status).toBe("published");
  });

  it("autopilot schedules directly", () => {
    channel(db, "Pepito Alerta").autopilot = true;
    fillQueue(db, USER, NOW);
    const pepito = channel(db, "Pepito Alerta");
    expect(db.posts.filter((p) => p.channelId === pepito.id).every((p) => p.status === "scheduled")).toBe(true);
  });

  it("refuses to approve invalid posts", () => {
    fillQueue(db, USER, NOW);
    const post = db.posts[0];
    post.title = "";
    expect(approvePost(db, USER, post.id)).toEqual({ ok: false, reason: "invalid" });
  });

  it("does not let another user touch my posts", () => {
    fillQueue(db, USER, NOW);
    expect(approvePost(db, "intruder", db.posts[0].id)).toEqual({ ok: false, reason: "not_found" });
  });

  it("moving an approved post sends it back for approval, with its sibling platforms", () => {
    fillQueue(db, USER, NOW);
    const [a, b] = db.posts;
    approvePost(db, USER, a.id); approvePost(db, USER, b.id);
    movePost(db, USER, a.id, "2026-10-20T16:00:00.000Z");
    expect([a.status, b.status]).toEqual(["proposed", "proposed"]);
    expect(b.scheduledAt).toBe("2026-10-20T16:00:00.000Z");
  });

  it("retries with backoff, then alerts on final failure", async () => {
    fillQueue(db, USER, NOW);
    const post = db.posts[0];
    approvePost(db, USER, post.id);
    const failing = new DryRunPublisher(() => "platform down");
    let t = new Date(post.scheduledAt!);
    await runDuePublishes(db, failing, t, media);
    expect(post).toMatchObject({ status: "failed", attempts: 1 });
    expect(new Date(post.nextAttemptAt!).getTime() - t.getTime()).toBe(5 * 60_000);
    t = new Date(post.nextAttemptAt!); await runDuePublishes(db, failing, t, media);
    t = new Date(post.nextAttemptAt!); await runDuePublishes(db, failing, t, media);
    expect(post).toMatchObject({ status: "failed", attempts: 3, nextAttemptAt: undefined });
    expect(db.notifications.filter((n) => n.postId === post.id).map((n) => n.kind)).toEqual(["publish_retry", "publish_retry", "publish_failed"]);
  });

  it("raises a low-queue alert once per day", () => {
    expect(checkLowQueue(db, USER, NOW)).toHaveLength(2); // 3 and 4.6 days < 5
    expect(checkLowQueue(db, USER, NOW)).toHaveLength(0);
  });
});
