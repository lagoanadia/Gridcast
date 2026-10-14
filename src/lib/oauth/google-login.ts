import { exchangeCode } from "./google";

/** "Sign in with Google": the same OAuth client as the YouTube connection, but only asking who you are. */
export const LOGIN_CALLBACK_PATH = "/api/auth/google/callback";

const authUrl = () => process.env.GOOGLE_AUTH_URL || "https://accounts.google.com/o/oauth2/v2/auth";
const userinfoUrl = () => process.env.GOOGLE_USERINFO_URL || "https://openidconnect.googleapis.com/v1/userinfo";

export function buildLoginUrl(a: { clientId: string; redirectUri: string; state: string }) {
  const q = new URLSearchParams({
    client_id: a.clientId, redirect_uri: a.redirectUri, response_type: "code",
    scope: "openid email profile", state: a.state, prompt: "select_account",
  });
  return `${authUrl()}?${q}`;
}

export interface GoogleProfile { sub: string; email: string; emailVerified: boolean; name: string; picture?: string }

/** Swaps the one-time code for the person's identity. Returns null if Google refuses at any step. */
export async function fetchProfile(
  a: { code: string; clientId: string; clientSecret: string; redirectUri: string },
  fetchImpl: typeof fetch = fetch,
): Promise<GoogleProfile | null> {
  const tokens = await exchangeCode(a, fetchImpl);
  if (!tokens) return null;
  const res = await fetchImpl(userinfoUrl(), { headers: { Authorization: `Bearer ${tokens.accessToken}` }, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) return null;
  const j = (await res.json().catch(() => null)) as { sub?: string; email?: string; email_verified?: boolean | string; name?: string; picture?: string } | null;
  if (!j?.sub || !j.email) return null;
  return {
    sub: String(j.sub), email: j.email, emailVerified: j.email_verified === true || j.email_verified === "true",
    name: j.name || j.email.split("@")[0], picture: j.picture,
  };
}
