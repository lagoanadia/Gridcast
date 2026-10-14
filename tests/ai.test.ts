import { describe, expect, it } from "vitest";
import { buildMessages, parseSuggestions, suggestCaptions } from "@/lib/ai";

const input = { title: "Jornada", idea: "puertas abiertas", platform: "instagram" as const, channelName: "Bioniche", tone: "cercano", fixedHashtags: ["bioniche"] };
const reply = (content: string, status = 200) => (async () => new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status })) as unknown as typeof fetch;

describe("parseSuggestions", () => {
  it("reads the JSON, cleans hashtags and caps at 3", () => {
    const raw = JSON.stringify({ suggestions: [1, 2, 3, 4].map((n) => ({ description: ` Texto ${n} `, hashtags: ["#uno", "dos tres", "uno", 5] })) });
    const out = parseSuggestions(raw);
    expect(out).toHaveLength(3);
    expect(out[0]).toEqual({ description: "Texto 1", hashtags: ["uno", "dostres"] });
  });
  it("accepts a code fence and rejects garbage", () => {
    expect(parseSuggestions('```json\n{"suggestions":[{"description":"a","hashtags":[]}]}\n```')).toHaveLength(1);
    expect(parseSuggestions("no json")).toEqual([]);
    expect(parseSuggestions('{"suggestions":[{"description":"  "}]}')).toEqual([]);
  });
});

describe("suggestCaptions", () => {
  it("includes the account, idea and fixed hashtags in the prompt", () => {
    const text = buildMessages(input).map((m) => m.content).join("\n");
    expect(text).toContain("Bioniche");
    expect(text).toContain("puertas abiertas");
    expect(text).toContain("bioniche");
  });
  it("reports a missing key without calling the network", async () => {
    let called = false;
    const r = await suggestCaptions(input, (async () => { called = true; return new Response(); }) as unknown as typeof fetch, {});
    expect(r).toEqual({ ok: false, reason: "not_configured" });
    expect(called).toBe(false);
  });
  it("sends the key as a bearer token and returns the suggestions", async () => {
    let auth = "";
    const f = (async (_u: unknown, init?: RequestInit) => { auth = String((init?.headers as Record<string, string>).Authorization); return reply('{"suggestions":[{"description":"ok","hashtags":["x"]}]}')(_u as string); }) as unknown as typeof fetch;
    const r = await suggestCaptions(input, f, { GROQ_API_KEY: "k123" });
    expect(auth).toBe("Bearer k123");
    expect(r).toMatchObject({ ok: true });
  });
  it("maps provider failures and unusable answers", async () => {
    expect(await suggestCaptions(input, reply("", 401), { GROQ_API_KEY: "k" })).toEqual({ ok: false, reason: "provider_error", status: 401 });
    expect(await suggestCaptions(input, reply("hola"), { GROQ_API_KEY: "k" })).toEqual({ ok: false, reason: "bad_answer" });
  });
});
