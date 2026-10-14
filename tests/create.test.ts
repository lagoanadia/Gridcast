import { describe, expect, it } from "vitest";
import { createContent } from "@/lib/create";
import { buildImagePrompt } from "@/lib/imagePrompt";
import { validatePost } from "@/lib/platforms";
import type { Post, Video } from "@/lib/types";
import { channel, NOW, seeded, USER } from "./helpers";

const base = (db: ReturnType<typeof seeded>) => {
  const ch = channel(db, "Bioniche");
  return db.videos.find((v) => v.channelId === ch.id && v.status === "ready")!;
};
const input = (videoId: string, over = {}) => ({ videoId, title: "Mi título", description: "Texto", hashtags: ["clase"], platforms: ["instagram" as const], mode: "next" as const, ...over });

describe("createContent", () => {
  it("schedules on the next free slot, one approved post per platform", () => {
    const db = seeded();
    const v = base(db);
    const res = createContent(db, USER, input(v.id, { platforms: ["instagram", "tiktok"] }), NOW);
    expect(res).toMatchObject({ ok: true, posts: 2 });
    const posts = db.posts.filter((p) => p.videoId === v.id);
    expect(posts.every((p) => p.status === "scheduled")).toBe(true);
    expect(posts[0].hashtags).toContain("clase");
    expect(v.status).toBe("scheduled");
    expect(v.title).toBe("Mi título");
  });

  it("takes the following slot when the first is already used", () => {
    const db = seeded();
    const [a, b] = db.videos.filter((v) => v.channelId === base(db).channelId && v.status === "ready");
    createContent(db, USER, input(a.id), NOW);
    createContent(db, USER, input(b.id), NOW);
    const [pa, pb] = [a, b].map((v) => db.posts.find((p) => p.videoId === v.id)!.scheduledAt!);
    expect(new Date(pb).getTime()).toBeGreaterThan(new Date(pa).getTime());
  });

  it("uses the channel time zone for a chosen date and rejects the past", () => {
    const db = seeded();
    const v = base(db);
    const ok = createContent(db, USER, input(v.id, { mode: "at", whenLocal: "2026-10-20T18:00" }), NOW);
    expect(ok.ok && ok.scheduledAt).toBe("2026-10-20T16:00:00.000Z"); // Europe/Madrid is UTC+2 in October
    expect(createContent(db, USER, input(v.id, { mode: "at", whenLocal: "2026-10-01T18:00" }), NOW)).toMatchObject({ ok: false, reason: "past" });
  });

  it("keeps a draft without posts", () => {
    const db = seeded();
    const v = base(db);
    expect(createContent(db, USER, input(v.id, { mode: "draft" }), NOW)).toEqual({ ok: true, posts: 0 });
    expect(db.posts).toHaveLength(0);
    expect(v.status).toBe("draft");
  });

  it("changes nothing when a post would be invalid", () => {
    const db = seeded();
    const v = base(db);
    v.width = 1920; v.height = 1080; // landscape video: not 9:16
    const res = createContent(db, USER, input(v.id, { title: "Otro" }), NOW);
    expect(res).toMatchObject({ ok: false, reason: "invalid" });
    expect(db.posts).toHaveLength(0);
    expect(v.title).not.toBe("Otro");
  });

  it("needs at least one platform and a known video", () => {
    const db = seeded();
    expect(createContent(db, USER, input(base(db).id, { platforms: [] }), NOW)).toMatchObject({ reason: "no_platforms" });
    expect(createContent(db, USER, input("nope"), NOW)).toMatchObject({ reason: "not_found" });
  });
});

describe("photos", () => {
  const photo = (w: number, h: number): Video => ({ id: "p", userId: USER, createdAt: "", channelId: "c", title: "t", description: "", filePath: "x", fileSizeBytes: 1000, width: w, height: h, status: "draft", formatTags: [], mediaType: "image" });
  const post = (platform: Post["platform"]): Post => ({ id: "x", userId: USER, createdAt: "", videoId: "p", channelId: "c", platform, title: "t", description: "", hashtags: [], status: "proposed", attempts: 0 });

  it("accepts 4:5 photos on Instagram without a duration", () => {
    expect(validatePost(post("instagram"), photo(1080, 1350)).filter((i) => i.severity === "error")).toEqual([]);
  });
  it("rejects extreme aspect ratios and YouTube", () => {
    expect(validatePost(post("instagram"), photo(1000, 2000)).some((i) => i.messageKey === "validation.aspectImage")).toBe(true);
    expect(validatePost(post("youtube"), photo(1080, 1350)).some((i) => i.messageKey === "validation.imageUnsupported")).toBe(true);
  });
});

describe("buildImagePrompt", () => {
  it("builds a structured prompt from the idea", () => {
    const p = buildImagePrompt({ idea: "  alumnos en el laboratorio. ", style: "realista", format: "vertical" });
    expect(p).toContain("alumnos en el laboratorio.");
    expect(p).toContain("4:5");
    expect(p).toContain("Evitar:");
  });
  it("returns nothing for an empty idea", () => {
    expect(buildImagePrompt({ idea: "   ", style: "cartel", format: "story" })).toBe("");
  });
});
