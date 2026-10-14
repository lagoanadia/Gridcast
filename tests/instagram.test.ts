import { describe, expect, it } from "vitest";
import { refreshDueTokens } from "@/lib/instagram-tokens";
import { availability, publisherMode } from "@/lib/publisher";
import { explainError, InstagramPublisher, inspectToken, refreshToken } from "@/lib/publisher/instagram";
import type { PublishRequest } from "@/lib/publisher/types";
import type { Database, Post, Video } from "@/lib/types";
import { emptyDb } from "@/lib/store";

const video = (over: Partial<Video> = {}): Video => ({ id: "v", userId: "u", createdAt: "", channelId: "c", mediaType: "image", title: "t", description: "", filePath: "supabase://b/p.jpg", status: "draft", formatTags: [], ...over });
const post: Post = { id: "p", userId: "u", createdAt: "", videoId: "v", channelId: "c", platform: "instagram", title: "Hola", description: "Texto", hashtags: ["clase"], status: "scheduled", attempts: 0 };
const req = (over: Partial<PublishRequest> = {}): PublishRequest => ({ post, video: video(), mediaUrl: "https://cdn.example/p.jpg", account: { platform: "instagram", handle: "@x", connected: true, tokenEncrypted: "enc", externalUserId: "999" }, ...over });

type Call = { method: string; url: string; body: string };
/** Replays scripted answers in order and records every request. */
function scripted(answers: { status?: number; json: unknown }[]) {
  const calls: Call[] = [];
  const f = (async (url: string, init?: RequestInit) => {
    calls.push({ method: init?.method ?? "GET", url: String(url), body: String(init?.body ?? "") });
    const a = answers.shift() ?? { status: 500, json: { error: { message: "no more answers" } } };
    return new Response(JSON.stringify(a.json), { status: a.status ?? 200 });
  }) as unknown as typeof fetch;
  return { f, calls };
}
const make = (f: typeof fetch, o = {}) => new InstagramPublisher({ fetchImpl: f, decrypt: () => "TOKEN", sleep: async () => undefined, pollMs: 0, ...o });

describe("InstagramPublisher", () => {
  it("publishes a photo: container, wait, publish, permalink", async () => {
    const { f, calls } = scripted([
      { json: { id: "c1" } }, { json: { status_code: "FINISHED" } }, { json: { id: "m1" } }, { json: { permalink: "https://www.instagram.com/p/abc/" } },
    ]);
    const r = await make(f).publish(req());
    expect(r).toEqual({ ok: true, externalId: "m1", externalUrl: "https://www.instagram.com/p/abc/", dryRun: false });
    expect(calls[0].url).toContain("/999/media");
    expect(calls[0].body).toContain("image_url=https%3A%2F%2Fcdn.example%2Fp.jpg");
    expect(calls[0].body).toContain("access_token=TOKEN");
    expect(decodeURIComponent(calls[0].body)).toContain("Hola");
    expect(calls[2].url).toContain("/999/media_publish");
    expect(calls[2].body).toContain("creation_id=c1");
  });

  it("publishes a video as a Reel and waits while it is processed", async () => {
    const { f, calls } = scripted([
      { json: { id: "c1" } }, { json: { status_code: "IN_PROGRESS" } }, { json: { status_code: "IN_PROGRESS" } }, { json: { status_code: "FINISHED" } }, { json: { id: "m1" } }, { json: { permalink: "https://i/r" } },
    ]);
    const r = await make(f).publish(req({ video: video({ mediaType: "video" }), mediaUrl: "https://cdn.example/v.mp4" }));
    expect(r).toMatchObject({ ok: true, externalId: "m1" });
    expect(calls[0].body).toContain("media_type=REELS");
    expect(calls[0].body).toContain("video_url=");
  });

  it("looks the account id up when it is not stored", async () => {
    const { f, calls } = scripted([{ json: { user_id: "555" } }, { json: { id: "c1" } }, { json: { status_code: "FINISHED" } }, { json: { id: "m1" } }, { json: {} }]);
    const r = await make(f).publish(req({ account: { platform: "instagram", handle: "@x", connected: true, tokenEncrypted: "enc" } }));
    expect(r).toMatchObject({ ok: true });
    expect(calls[1].url).toContain("/555/media");
  });

  it("gives up for now, retryably, if Instagram is too slow", async () => {
    let now = 0;
    const realNow = Date.now;
    Date.now = () => (now += 30_000);
    try {
      const { f } = scripted([{ json: { id: "c1" } }, ...Array.from({ length: 5 }, () => ({ json: { status_code: "IN_PROGRESS" } }))]);
      const r = await make(f, { maxWaitMs: 40_000 }).publish(req({ video: video({ mediaType: "video" }) }));
      expect(r).toMatchObject({ ok: false, retryable: true });
    } finally { Date.now = realNow; }
  });

  it("reports an expired token without retrying", async () => {
    const { f } = scripted([{ status: 400, json: { error: { message: "Invalid OAuth access token", code: 190 } } }]);
    const r = await make(f).publish(req());
    expect(r).toMatchObject({ ok: false, retryable: false });
    expect(!r.ok && r.error).toContain("Vuelve a conectar");
  });

  it("stops when processing fails, and when nothing is connected or public", async () => {
    const { f } = scripted([{ json: { id: "c1" } }, { json: { status_code: "ERROR", status: "Formato no admitido" } }]);
    expect(await make(f).publish(req())).toMatchObject({ ok: false, retryable: false });
    expect(await make(scripted([]).f, { env: {} }).publish(req({ account: undefined }))).toMatchObject({ ok: false, error: expect.stringContaining("Conéctalo") });
    expect(await make(scripted([]).f).publish(req({ mediaUrl: "/tmp/local.jpg" }))).toMatchObject({ ok: false, error: expect.stringContaining("URL pública") });
  });

  it("retries on a network failure", async () => {
    const f = (async () => { throw new Error("ECONNRESET"); }) as unknown as typeof fetch;
    expect(await make(f).publish(req())).toMatchObject({ ok: false, retryable: true });
  });

  it("falls back to INSTAGRAM_ACCESS_TOKEN when the account has none", async () => {
    const { f, calls } = scripted([{ json: { id: "c1" } }, { json: { status_code: "FINISHED" } }, { json: { id: "m1" } }, { json: {} }]);
    await make(f, { env: { INSTAGRAM_ACCESS_TOKEN: "ENVTOKEN" } }).publish(req({ account: { platform: "instagram", handle: "", connected: false, externalUserId: "9" } }));
    expect(calls[0].body).toContain("access_token=ENVTOKEN");
  });
});

describe("helpers", () => {
  it("classifies errors", () => {
    expect(explainError(429, { error: { code: 4, message: "rate" } }).retryable).toBe(true);
    expect(explainError(500, null).retryable).toBe(true);
    expect(explainError(400, { error: { code: 100, message: "bad" } }).retryable).toBe(false);
  });
  it("inspects and refreshes a token", async () => {
    expect(await inspectToken("t", scripted([{ json: { user_id: 7, username: "bioniche" } }]).f)).toEqual({ ok: true, userId: "7", username: "bioniche" });
    expect(await inspectToken("t", scripted([{ status: 400, json: { error: { code: 190, message: "x" } } }]).f)).toMatchObject({ ok: false });
    expect(await refreshToken("t", scripted([{ json: { access_token: "new" } }]).f)).toBe("new");
    expect(await refreshToken("t", scripted([{ status: 400, json: {} }]).f)).toBeNull();
  });
  it("renews only tokens older than 30 days", async () => {
    const db: Database = emptyDb();
    const now = new Date("2026-10-14T10:00:00Z");
    const acc = (daysAgo: number) => ({ platform: "instagram" as const, handle: "@a", connected: true, tokenEncrypted: "old", tokenIssuedAt: new Date(now.getTime() - daysAgo * 86_400_000).toISOString() });
    db.channels.push({ id: "a", userId: "u", createdAt: "", name: "A", slug: "a", color: "#000", timezone: "UTC", autopilot: false, lowQueueThresholdDays: 5, accounts: [acc(40)] });
    db.channels.push({ id: "b", userId: "u", createdAt: "", name: "B", slug: "b", color: "#000", timezone: "UTC", autopilot: false, lowQueueThresholdDays: 5, accounts: [acc(5)] });
    const n = await refreshDueTokens(db, now, { refresh: async () => "fresh", decrypt: (x) => x, encrypt: (x) => `enc:${x}` });
    expect(n).toBe(1);
    expect(db.channels[0].accounts[0].tokenEncrypted).toBe("enc:fresh");
    expect(db.channels[1].accounts[0].tokenEncrypted).toBe("old");
  });
  it("is live only with cloud storage, and checks availability per account", () => {
    expect(publisherMode({})).toBe("dry-run");
    expect(publisherMode({ SUPABASE_URL: "https://x.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "k" })).toBe("live");
    expect(publisherMode({ PUBLISHER_MODE: "dry-run", SUPABASE_URL: "https://x.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "k" })).toBe("dry-run");
    const connected = { platform: "instagram" as const, handle: "@a", connected: true, tokenEncrypted: "e" };
    expect(availability("instagram", connected, "live", {})).toEqual({ ok: true });
    expect(availability("instagram", undefined, "live", {})).toEqual({ ok: false, reason: "connect" });
    expect(availability("tiktok", { ...connected, platform: "tiktok" }, "live", {})).toEqual({ ok: false, reason: "soon" });
    expect(availability("tiktok", undefined, "dry-run", {})).toEqual({ ok: true });
  });
});
