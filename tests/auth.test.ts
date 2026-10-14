import { describe, expect, it } from "vitest";
import { authConfig, isEmailAllowed, isPublicPath, safeNext, userIdFromSub } from "@/lib/auth";
import { buildLoginUrl, fetchProfile } from "@/lib/oauth/google-login";
import { signSession, verifySession } from "@/lib/session";
import { createContent } from "@/lib/create";
import { approvePost } from "@/lib/services";
import { scoped } from "@/lib/store";
import { channel, NOW, seeded } from "./helpers";

const SECRET = "s3cret-for-tests";
const user = { uid: "g_123", email: "a@b.com", name: "Ana" };

describe("session cookie", () => {
  it("round-trips a valid session", async () => {
    const t = await signSession(user, SECRET, NOW.getTime());
    expect(await verifySession(t, SECRET, NOW.getTime() + 1000)).toMatchObject(user);
  });
  it("rejects tampering, a wrong secret, expiry and junk", async () => {
    const t = await signSession(user, SECRET, NOW.getTime());
    const [body, sig] = t.split(".");
    const forged = btoa(JSON.stringify({ ...user, uid: "g_evil", exp: 9999999999 })).replace(/=+$/, "");
    expect(await verifySession(`${forged}.${sig}`, SECRET, NOW.getTime())).toBeNull();
    expect(await verifySession(`${body}.${sig.slice(0, -2)}xx`, SECRET, NOW.getTime())).toBeNull();
    expect(await verifySession(t, "other-secret", NOW.getTime())).toBeNull();
    expect(await verifySession(t, SECRET, NOW.getTime() + 31 * 86_400_000)).toBeNull();
    for (const junk of [undefined, "", "abc", "a.b.c", "."]) expect(await verifySession(junk, SECRET, NOW.getTime())).toBeNull();
  });
});

describe("auth config and access rules", () => {
  it("is on only with Google credentials and a signing secret", () => {
    expect(authConfig({})).toBeNull();
    expect(authConfig({ GOOGLE_CLIENT_ID: "i", GOOGLE_CLIENT_SECRET: "s" })).toBeNull();
    expect(authConfig({ GOOGLE_CLIENT_ID: "i", GOOGLE_CLIENT_SECRET: "s", TOKEN_ENCRYPTION_KEY: "k" })).toMatchObject({ secret: "k", allowedEmails: null });
    expect(authConfig({ GOOGLE_CLIENT_ID: "i", GOOGLE_CLIENT_SECRET: "s", SESSION_SECRET: "x", TOKEN_ENCRYPTION_KEY: "k" })?.secret).toBe("x");
  });
  it("restricts emails only when a list is set", () => {
    const cfg = authConfig({ GOOGLE_CLIENT_ID: "i", GOOGLE_CLIENT_SECRET: "s", SESSION_SECRET: "x", ALLOWED_EMAILS: "Ana@x.com, bob@x.com" })!;
    expect(cfg.allowedEmails).toEqual(["ana@x.com", "bob@x.com"]);
    expect(isEmailAllowed("ANA@x.com", cfg.allowedEmails)).toBe(true);
    expect(isEmailAllowed("eve@x.com", cfg.allowedEmails)).toBe(false);
    expect(isEmailAllowed("anyone@x.com", null)).toBe(true);
  });
  it("knows which paths are public", () => {
    for (const p of ["/login", "/api/auth/google/start", "/api/cron/tick", "/offline", "/sw.js", "/icons/icon-192.png", "/tiktok7Qd2UFd5JVcFX2tpsJfUiiT4eneJQLxN.txt", "/_next/static/x.js"]) expect(isPublicPath(p)).toBe(true);
    for (const p of ["/", "/create", "/api/create", "/api/media/abc", "/api/oauth/google/start", "/loginx", "/tiktok.html", "/api/authx"]) expect(isPublicPath(p)).toBe(false);
  });
  it("only follows same-site redirects", () => {
    expect(safeNext("/create?x=1")).toBe("/create?x=1");
    for (const bad of ["//evil.com", "https://evil.com", "/\\evil.com", "javascript:alert(1)", "", null, undefined]) expect(safeNext(bad as string)).toBe("/");
  });
  it("derives the user id from Google's account id", () => { expect(userIdFromSub("123")).toBe("g_123"); });
});

describe("google login", () => {
  it("asks only for identity", () => {
    const u = new URL(buildLoginUrl({ clientId: "cid", redirectUri: "https://x/cb", state: "st" }));
    expect(u.searchParams.get("scope")).toBe("openid email profile");
    expect(u.searchParams.get("state")).toBe("st");
    expect(u.searchParams.get("scope")).not.toContain("youtube");
  });
  it("turns a code into a profile, and refuses otherwise", async () => {
    const f = (async (url: string) => String(url).includes("token")
      ? new Response(JSON.stringify({ access_token: "at", expires_in: 3600 }))
      : new Response(JSON.stringify({ sub: "42", email: "a@b.com", email_verified: true, name: "Ana", picture: "p" }))) as unknown as typeof fetch;
    expect(await fetchProfile({ code: "c", clientId: "i", clientSecret: "s", redirectUri: "r" }, f)).toEqual({ sub: "42", email: "a@b.com", emailVerified: true, name: "Ana", picture: "p" });
    const bad = (async () => new Response("{}", { status: 400 })) as unknown as typeof fetch;
    expect(await fetchProfile({ code: "c", clientId: "i", clientSecret: "s", redirectUri: "r" }, bad)).toBeNull();
  });
});

describe("every person only sees and touches their own data", () => {
  it("scopes a snapshot to its owner and never exposes other profiles", () => {
    const db = seeded();
    db.users.push({ id: "u1", email: "a@b.c", name: "A", createdAt: "", lastLoginAt: "" });
    expect(scoped(db, "u1").channels.length).toBeGreaterThan(0);
    expect(scoped(db, "u1").users).toEqual([]);
    const other = scoped(db, "someone-else");
    expect(other.channels).toEqual([]);
    expect(other.videos).toEqual([]);
    expect(other.posts).toEqual([]);
  });
  it("refuses to schedule or approve another person's content", () => {
    const db = seeded();
    const video = db.videos.find((v) => v.channelId === channel(db, "Bioniche").id && v.status === "ready")!;
    const input = { videoId: video.id, title: "x", description: "", hashtags: [], platforms: ["instagram" as const], mode: "next" as const };
    expect(createContent(db, "intruder", input, NOW)).toMatchObject({ ok: false, reason: "not_found" });
    expect(createContent(db, "u1", input, NOW)).toMatchObject({ ok: true });
    const post = db.posts.find((p) => p.videoId === video.id)!;
    post.status = "proposed";
    expect(approvePost(db, "intruder", post.id)).toMatchObject({ ok: false, reason: "not_found" });
  });
});
