import { decryptToken } from "../crypto";
import { composeCaption } from "../platforms";
import type { Publisher, PublishRequest, PublishResult } from "./types";

/**
 * Publishes photos and Reels with the Instagram API (Instagram Login flavour: no Facebook Page needed).
 * Flow per post: create a media container from a public URL, wait until Instagram has processed it, publish it.
 * Each channel keeps its own token, encrypted on its Instagram account.
 */
const HOST = "https://graph.instagram.com";
const VERSION = "v23.0";

export interface InstagramOptions {
  fetchImpl?: typeof fetch;
  host?: string;
  version?: string;
  /** How long to wait for Instagram to process a video before giving up for now (the post is retried later). */
  maxWaitMs?: number;
  pollMs?: number;
  sleep?: (ms: number) => Promise<void>;
  decrypt?: (payload: string) => string;
  env?: Record<string, string | undefined>;
}

type GraphError = { error?: { message?: string; code?: number; is_transient?: boolean } };

const TRANSIENT_CODES = new Set([1, 2, 4, 17, 32, 341, 613]);

export function explainError(status: number, body: GraphError | null): { error: string; retryable: boolean } {
  const e = body?.error;
  const code = e?.code;
  if (code === 190) return { error: "El token de Instagram ha caducado o no es válido. Vuelve a conectar la cuenta en Cuentas.", retryable: false };
  if (code === 10 || code === 200) return { error: `Instagram no da permiso para publicar (${e?.message ?? code}). Revisa los permisos de la app.`, retryable: false };
  if (code === 9007 || code === 2207026) return { error: "Instagram todavía está procesando el vídeo.", retryable: true };
  const retryable = !!e?.is_transient || (code !== undefined && TRANSIENT_CODES.has(code)) || status >= 500;
  return { error: `Instagram: ${e?.message ?? `error ${status}`}`, retryable };
}

export class InstagramPublisher implements Publisher {
  readonly name = "instagram";
  readonly dryRun = false;
  private f: typeof fetch;
  private base: string;
  private maxWaitMs: number;
  private pollMs: number;
  private sleep: (ms: number) => Promise<void>;
  private decrypt: (p: string) => string;
  private env: Record<string, string | undefined>;

  constructor(o: InstagramOptions = {}) {
    this.f = o.fetchImpl ?? fetch;
    this.base = `${o.host ?? HOST}/${o.version ?? VERSION}`;
    this.maxWaitMs = o.maxWaitMs ?? 40_000;
    this.pollMs = o.pollMs ?? 3_000;
    this.sleep = o.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.decrypt = o.decrypt ?? decryptToken;
    this.env = o.env ?? process.env;
  }

  supports(platform: string) { return platform === "instagram"; }

  private token(req: PublishRequest): string | null {
    const enc = req.account?.tokenEncrypted;
    if (enc) { try { return this.decrypt(enc); } catch { return null; } }
    return this.env.INSTAGRAM_ACCESS_TOKEN || null; // optional single-account shortcut
  }

  private async call(method: "GET" | "POST", path: string, token: string, params: Record<string, string> = {}) {
    const url = new URL(`${this.base}/${path}`);
    const body = new URLSearchParams({ ...params, access_token: token });
    const res = await this.f(method === "GET" ? `${url}?${body}` : url.toString(), {
      method,
      headers: method === "POST" ? { "Content-Type": "application/x-www-form-urlencoded" } : undefined,
      body: method === "POST" ? body : undefined,
      signal: AbortSignal.timeout(25_000),
    });
    const json = (await res.json().catch(() => null)) as (GraphError & Record<string, unknown>) | null;
    return { ok: res.ok && !json?.error, status: res.status, json };
  }

  async publish(req: PublishRequest): Promise<PublishResult> {
    const { post, video, mediaUrl } = req;
    const token = this.token(req);
    if (!token) return { ok: false, error: "Esta cuenta no tiene Instagram conectado. Conéctalo en Cuentas.", retryable: false };
    if (!/^https:\/\//.test(mediaUrl)) return { ok: false, error: "El archivo no tiene una URL pública. Hace falta el almacenamiento en la nube.", retryable: false };

    try {
      let igId = req.account?.externalUserId;
      if (!igId) {
        const me = await this.call("GET", "me", token, { fields: "user_id" });
        if (!me.ok) return { ok: false, ...explainError(me.status, me.json) };
        igId = String(me.json?.user_id ?? me.json?.id ?? "");
        if (!igId) return { ok: false, error: "No he podido leer el identificador de la cuenta de Instagram.", retryable: false };
      }

      const isImage = video.mediaType === "image";
      const created = await this.call("POST", `${igId}/media`, token, {
        caption: composeCaption(post),
        ...(isImage ? { image_url: mediaUrl } : { media_type: "REELS", video_url: mediaUrl, share_to_feed: "true" }),
      });
      const containerId = created.json?.id ? String(created.json.id) : "";
      if (!created.ok || !containerId) return { ok: false, ...explainError(created.status, created.json) };

      // Wait until Instagram has downloaded and processed the file.
      const deadline = Date.now() + this.maxWaitMs;
      for (;;) {
        const st = await this.call("GET", containerId, token, { fields: "status_code,status" });
        if (!st.ok) return { ok: false, ...explainError(st.status, st.json) };
        const code = String(st.json?.status_code ?? "");
        if (code === "FINISHED") break;
        if (code === "ERROR" || code === "EXPIRED") return { ok: false, error: `Instagram no ha podido procesar el archivo (${String(st.json?.status ?? code)}).`, retryable: false };
        if (Date.now() >= deadline) return { ok: false, error: "Instagram tarda en procesar el vídeo; se reintentará.", retryable: true };
        await this.sleep(this.pollMs);
      }

      const published = await this.call("POST", `${igId}/media_publish`, token, { creation_id: containerId });
      const mediaId = published.json?.id ? String(published.json.id) : "";
      if (!published.ok || !mediaId) return { ok: false, ...explainError(published.status, published.json) };

      const link = await this.call("GET", mediaId, token, { fields: "permalink" });
      const permalink = link.ok && typeof link.json?.permalink === "string" ? link.json.permalink : `https://www.instagram.com/`;
      return { ok: true, externalId: mediaId, externalUrl: permalink, dryRun: false };
    } catch (e) {
      return { ok: false, error: `No se ha podido contactar con Instagram: ${(e as Error).message}`, retryable: true };
    }
  }
}

/** Reads the account behind a token: used when connecting, to show @handle and keep the account id. */
export async function inspectToken(token: string, fetchImpl: typeof fetch = fetch, host = HOST, version = VERSION) {
  const url = `${host}/${version}/me?${new URLSearchParams({ fields: "user_id,username", access_token: token })}`;
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(15_000) });
  const json = (await res.json().catch(() => null)) as (GraphError & { user_id?: string | number; id?: string; username?: string }) | null;
  if (!res.ok || json?.error || !(json?.user_id ?? json?.id)) return { ok: false as const, ...explainError(res.status, json) };
  return { ok: true as const, userId: String(json.user_id ?? json.id), username: json.username ?? "" };
}

/** Instagram tokens last 60 days; refreshing returns a new one. Allowed once the token is at least a day old. */
export async function refreshToken(token: string, fetchImpl: typeof fetch = fetch, host = HOST): Promise<string | null> {
  const url = `${host}/refresh_access_token?${new URLSearchParams({ grant_type: "ig_refresh_token", access_token: token })}`;
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(15_000) });
  const json = (await res.json().catch(() => null)) as { access_token?: string } | null;
  return res.ok && json?.access_token ? json.access_token : null;
}
