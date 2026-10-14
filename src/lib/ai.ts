import { PLATFORM_LIMITS } from "./platforms";
import type { Platform } from "./types";

/** Groq exposes an OpenAI-compatible chat API. The key only ever lives in the GROQ_API_KEY environment variable. */
const ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
export const DEFAULT_GROQ_MODEL = "llama-3.3-70b-versatile";

export interface Suggestion { description: string; hashtags: string[] }

export interface SuggestInput {
  title: string;
  idea: string;
  platform: Platform;
  channelName: string;
  tone?: string;
  fixedHashtags?: string[];
}

export function buildMessages(i: SuggestInput) {
  const lim = PLATFORM_LIMITS[i.platform];
  const system =
    "Eres un community manager que escribe textos para redes sociales en español de España. " +
    "Respondes SIEMPRE y SOLO con un objeto JSON válido, sin texto fuera del JSON.";
  const user = [
    `Cuenta: ${i.channelName}.`,
    i.tone ? `Tono de voz: ${i.tone}.` : "",
    `Red: ${lim.label}.`,
    `Título de la publicación: ${i.title || "(sin título)"}.`,
    `Idea o borrador del autor: ${i.idea || "(ninguno; inventa algo coherente con el título)"}.`,
    "",
    "Escribe 3 versiones distintas del texto que va debajo de la foto o del vídeo: una breve (1-2 frases), una media y una más cercana con una pregunta al público.",
    `Cada texto debe tener menos de ${Math.min(lim.descriptionMax - 200, 600)} caracteres, sin hashtags dentro del texto y sin emojis en exceso.`,
    `Para cada versión añade entre 3 y 6 hashtags relevantes, sin el símbolo # y sin espacios.${i.fixedHashtags?.length ? ` No repitas estos, que ya se añaden solos: ${i.fixedHashtags.join(", ")}.` : ""}`,
    "",
    'Formato exacto: {"suggestions":[{"description":"...","hashtags":["...","..."]}, {...}, {...}]}',
  ].filter(Boolean).join("\n");
  return [{ role: "system", content: system }, { role: "user", content: user }];
}

/** Tolerant parser: accepts the JSON with or without a code fence, and drops anything malformed. */
export function parseSuggestions(raw: string): Suggestion[] {
  const text = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  let data: unknown;
  try { data = JSON.parse(text); } catch { return []; }
  const list = (data as { suggestions?: unknown })?.suggestions;
  if (!Array.isArray(list)) return [];
  return list
    .map((s): Suggestion | null => {
      const o = s as { description?: unknown; hashtags?: unknown };
      if (typeof o?.description !== "string" || !o.description.trim()) return null;
      const tags = Array.isArray(o.hashtags) ? o.hashtags.filter((h): h is string => typeof h === "string") : [];
      return {
        description: o.description.trim(),
        hashtags: Array.from(new Set(tags.map((h) => h.trim().replace(/^#+/, "").replace(/\s+/g, "")).filter(Boolean))).slice(0, 8),
      };
    })
    .filter((s): s is Suggestion => s !== null)
    .slice(0, 3);
}

export type SuggestResult = { ok: true; suggestions: Suggestion[] } | { ok: false; reason: "not_configured" | "provider_error" | "bad_answer"; status?: number };

export async function suggestCaptions(input: SuggestInput, fetchImpl: typeof fetch = fetch, env: Record<string, string | undefined> = process.env): Promise<SuggestResult> {
  const key = env.GROQ_API_KEY;
  if (!key) return { ok: false, reason: "not_configured" };
  let res: Response;
  try {
    res = await fetchImpl(ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: env.GROQ_MODEL || DEFAULT_GROQ_MODEL,
        messages: buildMessages(input),
        temperature: 0.8,
        max_tokens: 900,
        response_format: { type: "json_object" },
      }),
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    return { ok: false, reason: "provider_error" };
  }
  if (!res.ok) return { ok: false, reason: "provider_error", status: res.status };
  const body = (await res.json().catch(() => null)) as { choices?: { message?: { content?: string } }[] } | null;
  const suggestions = parseSuggestions(body?.choices?.[0]?.message?.content ?? "");
  return suggestions.length ? { ok: true, suggestions } : { ok: false, reason: "bad_answer" };
}
