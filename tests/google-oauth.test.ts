import { describe, expect, it } from "vitest";
import { appOrigin, buildAuthUrl, exchangeCode, fetchChannelHandle } from "@/lib/oauth/google";

const json = (body: unknown, status = 200) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

describe("google oauth", () => {
  it("builds an offline-access consent URL", () => {
    const u = new URL(buildAuthUrl({ clientId: "cid", redirectUri: "https://x.app/api/oauth/google/callback", state: "abc" }));
    expect(u.origin + u.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(u.searchParams.get("access_type")).toBe("offline");
    expect(u.searchParams.get("prompt")).toBe("consent");
    expect(u.searchParams.get("state")).toBe("abc");
    expect(u.searchParams.get("scope")).toContain("youtube.upload");
  });

  it("exchanges the code and computes the expiry", async () => {
    let body = "";
    const f = (async (_u: unknown, init?: RequestInit) => { body = String(init?.body); return new Response(JSON.stringify({ access_token: "a", refresh_token: "r", expires_in: 3600 })); }) as unknown as typeof fetch;
    const t = await exchangeCode({ code: "c", clientId: "id", clientSecret: "sec", redirectUri: "https://x/cb" }, f, new Date("2026-10-14T10:00:00Z"));
    expect(t).toMatchObject({ accessToken: "a", refreshToken: "r", expiresAt: "2026-10-14T11:00:00.000Z" });
    expect(body).toContain("grant_type=authorization_code");
  });

  it("returns null when Google refuses", async () => {
    expect(await exchangeCode({ code: "c", clientId: "id", clientSecret: "s", redirectUri: "r" }, json({}, 400))).toBeNull();
    expect(await exchangeCode({ code: "c", clientId: "id", clientSecret: "s", redirectUri: "r" }, json({ nope: 1 }))).toBeNull();
  });

  it("reads the channel handle, preferring the custom URL", async () => {
    expect(await fetchChannelHandle("t", json({ items: [{ snippet: { title: "Bioniche", customUrl: "@bioniche" } }] }))).toBe("@bioniche");
    expect(await fetchChannelHandle("t", json({ items: [] }))).toBeNull();
  });

  it("derives the public origin from APP_URL or forwarded headers", () => {
    const req = new Request("http://localhost:3000/x", { headers: { "x-forwarded-host": "gridcast.vercel.app", "x-forwarded-proto": "https" } });
    expect(appOrigin(req, {})).toBe("https://gridcast.vercel.app");
    expect(appOrigin(req, { APP_URL: "https://mi-dominio.es/" })).toBe("https://mi-dominio.es");
    expect(appOrigin(new Request("http://localhost:3000/x"), {})).toBe("http://localhost:3000");
  });
});
