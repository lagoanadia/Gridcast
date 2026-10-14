/** Sign-in with Google. Everything here is pure so it can run in middleware and be tested. */
type Env = Record<string, string | undefined>;

export interface AuthConfig {
  clientId: string;
  clientSecret: string;
  /** Signs session cookies. */
  secret: string;
  /** When set, only these emails may sign in; otherwise any Google account can. */
  allowedEmails: string[] | null;
}

/** Login is on only when Google credentials and a signing secret exist; otherwise the app is open (local development). */
export function authConfig(env: Env = process.env): AuthConfig | null {
  const clientId = env.GOOGLE_CLIENT_ID;
  const clientSecret = env.GOOGLE_CLIENT_SECRET;
  const secret = env.SESSION_SECRET || env.TOKEN_ENCRYPTION_KEY;
  if (!clientId || !clientSecret || !secret) return null;
  const list = (env.ALLOWED_EMAILS ?? "").split(/[,\s]+/).map((e) => e.trim().toLowerCase()).filter(Boolean);
  return { clientId, clientSecret, secret, allowedEmails: list.length ? list : null };
}

export const isEmailAllowed = (email: string, allowed: string[] | null) => !allowed || allowed.includes(email.toLowerCase());

/** Stable id of a user, derived from Google's account id (never from the email, which can change). */
export const userIdFromSub = (sub: string) => `g_${sub}`;

const PUBLIC_EXACT = ["/login", "/offline", "/privacidad", "/terminos", "/sw.js", "/manifest.webmanifest", "/icon.svg", "/favicon.ico"];
const PUBLIC_PREFIXES = ["/api/auth/", "/api/cron/", "/icons/", "/brand/", "/_next/"];

/** Pages and files anyone can fetch without a session. Matching is exact or by folder, never by loose prefix. */
export function isPublicPath(pathname: string): boolean {
  return (
    PUBLIC_EXACT.includes(pathname) ||
    PUBLIC_PREFIXES.some((p) => pathname.startsWith(p)) ||
    /^\/tiktok[A-Za-z0-9]+\.txt$/.test(pathname) // TikTok's site-verification file
  );
}

/** Only same-site paths: stops a crafted link from bouncing the user to another website after login. */
export function safeNext(next: string | null | undefined): string {
  return next && /^\/(?![/\\])/.test(next) && !next.includes("\n") ? next : "/";
}
