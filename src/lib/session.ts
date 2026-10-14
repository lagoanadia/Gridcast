import { safeEqual } from "./safeEqual";

/**
 * Signed session cookie. Payload and HMAC-SHA256 signature, both base64url, joined by a dot.
 * Uses Web Crypto so it runs in middleware (edge) and in Node.
 */
export const SESSION_COOKIE = "gc_session";
export const SESSION_DAYS = 30;

export interface SessionUser { uid: string; email: string; name: string; picture?: string; exp: number }

const enc = new TextEncoder();

function toB64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromB64url(s: string): Uint8Array {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function sign(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return toB64url(new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(data))));
}

export async function signSession(user: Omit<SessionUser, "exp">, secret: string, now = Date.now(), days = SESSION_DAYS): Promise<string> {
  const payload: SessionUser = { ...user, exp: Math.floor(now / 1000) + days * 86_400 };
  const body = toB64url(enc.encode(JSON.stringify(payload)));
  return `${body}.${await sign(secret, body)}`;
}

/** Returns the user if the signature is valid and the session has not expired. */
export async function verifySession(token: string | undefined, secret: string, now = Date.now()): Promise<SessionUser | null> {
  if (!token) return null;
  const [body, sig, extra] = token.split(".");
  if (!body || !sig || extra !== undefined) return null;
  if (!safeEqual(sig, await sign(secret, body))) return null;
  try {
    const u = JSON.parse(new TextDecoder().decode(fromB64url(body))) as SessionUser;
    if (typeof u.uid !== "string" || !u.uid || typeof u.exp !== "number" || u.exp * 1000 <= now) return null;
    return u;
  } catch {
    return null;
  }
}
