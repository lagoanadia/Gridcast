import { describe, expect, it } from "vitest";
import { composeCaption, validatePost } from "@/lib/platforms";
import { buildPostDraft } from "@/lib/templates";
import type { Post } from "@/lib/types";
import { seeded } from "./helpers";

const mkPost = (over: Partial<Post>): Post => ({
  id: "p", userId: "u1", createdAt: "", videoId: "v", channelId: "c", platform: "youtube",
  title: "Hello", description: "", hashtags: [], status: "proposed", attempts: 0, ...over,
});

describe("platform validation", () => {
  const video = seeded().videos[0];

  it("accepts a valid 9:16 short", () => {
    expect(validatePost(mkPost({}), video)).toEqual([]);
  });
  it("rejects horizontal video, long titles, too many hashtags and expiry", () => {
    const issues = validatePost(
      mkPost({ title: "x".repeat(101), hashtags: Array.from({ length: 16 }, (_, i) => `t${i}`), scheduledAt: "2027-01-02T00:00:00Z" }),
      { ...video, width: 1920, height: 1080, expiresAt: "2027-01-01T00:00:00Z" },
    );
    expect(issues.map((i) => i.field).sort()).toEqual(["aspect", "expiry", "hashtags", "title"]);
  });
  it("applies per-platform duration limits", () => {
    const long = { ...video, durationSec: 300 };
    expect(validatePost(mkPost({ platform: "youtube" }), long).map((i) => i.field)).toContain("duration");
    expect(validatePost(mkPost({ platform: "tiktok" }), long)).toEqual([]);
  });
  it("counts the full caption for TikTok", () => {
    const post = mkPost({ platform: "tiktok", title: "T", description: "d".repeat(2190), hashtags: ["abcdef"] });
    expect(composeCaption(post).length).toBeGreaterThan(2200);
    expect(validatePost(post, video).map((i) => i.field)).toEqual(["description"]);
  });
});

describe("templates", () => {
  it("merges fixed hashtags, dedupes and appends the footer", () => {
    const db = seeded();
    const tpl = db.templates.find((t) => t.platform === "youtube")!;
    const draft = buildPostDraft(db.videos[3], "youtube", tpl, ["#Bioniche", "nature"]);
    expect(draft.hashtags).toEqual(["Bioniche", "nature", "bioniche", "shorts"]);
    expect(draft.description).toContain("Subscribe to Bioniche");
  });
});
