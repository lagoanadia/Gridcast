/** Google OAuth 2.0 (authorization-code flow, server side) for connecting a YouTube channel. */
export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload", // publish videos
  "https://www.googleapis.com/auth/youtube.readonly", // read the channel's name
];

// Endpoints can be pointed at a local fake Google in end-to-end tests; in production the defaults are used.
const authUrl = () => process.env.GOOGLE_AUTH_URL || "https://accounts.google.com/o/oauth2/v2/auth";
const tokenUrl = () => process.env.GOOGLE_TOKEN_URL || "https://oauth2.googleapis.com/token";
const CHANNEL_URL = "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true";

export const CALLBACK_PATH = "/api/oauth/google/callback";

export interface StoredGoogleTokens { accessToken: string; refreshToken?: string; expiresAt: string; scope?: string }

export function buildAuthUrl(args: { clientId: string; redirectUri: string; state: string }) {
  const q = new URLSearchParams({
    client_id: args.clientId,
    redirect_uri: args.redirectUri,
    response_type: "code",
    scope: GOOGLE_SCOPES.join(" "),
    access_type: "offline", // ask for a refresh token
    prompt: "consent", // Google only returns the refresh token on the consent screen
    include_granted_scopes: "true",
    state: args.state,
  });
  return `${authUrl()}?${q}`;
}

export async function exchangeCode(
  args: { code: string; clientId: string; clientSecret: string; redirectUri: string },
  fetchImpl: typeof fetch = fetch,
  now = new Date(),
): Promise<StoredGoogleTokens | null> {
  const res = await fetchImpl(tokenUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: args.code, client_id: args.clientId, client_secret: args.clientSecret, redirect_uri: args.redirectUri, grant_type: "authorization_code",
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) return null;
  const j = (await res.json().catch(() => null)) as { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string } | null;
  if (!j?.access_token) return null;
  return {
    accessToken: j.access_token,
    refreshToken: j.refresh_token,
    expiresAt: new Date(now.getTime() + (j.expires_in ?? 3600) * 1000).toISOString(),
    scope: j.scope,
  };
}

/** Name of the YouTube channel the user just authorised (shown on the Cuentas screen). */
export async function fetchChannelHandle(accessToken: string, fetchImpl: typeof fetch = fetch): Promise<string | null> {
  const res = await fetchImpl(CHANNEL_URL, { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) return null;
  const j = (await res.json().catch(() => null)) as { items?: { snippet?: { title?: string; customUrl?: string } }[] } | null;
  const s = j?.items?.[0]?.snippet;
  return s?.customUrl || s?.title || null;
}

/** Public origin of this deployment. APP_URL wins; otherwise the forwarded host (Vercel) or the request URL. */
export function appOrigin(req: Request, env: Record<string, string | undefined> = process.env): string {
  if (env.APP_URL) return env.APP_URL.replace(/\/+$/, "");
  const host = req.headers.get("x-forwarded-host") ?? new URL(req.url).host;
  const proto = req.headers.get("x-forwarded-proto") ?? new URL(req.url).protocol.replace(":", "");
  return `${proto}://${host}`;
}
