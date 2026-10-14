import { NextResponse } from "next/server";
import { authConfig, isEmailAllowed, safeNext, userIdFromSub } from "@/lib/auth";
import { appOrigin } from "@/lib/oauth/google";
import { fetchProfile, LOGIN_CALLBACK_PATH } from "@/lib/oauth/google-login";
import { safeEqual } from "@/lib/safeEqual";
import { SESSION_COOKIE, SESSION_DAYS, signSession } from "@/lib/session";
import { mutate, nowIso } from "@/lib/store";

const STATE_COOKIE = "gc_login";

/** Step 2: Google sends the person back with a one-time code. We learn who they are, remember them, and start their session. */
export async function GET(req: Request) {
  const origin = appOrigin(req);
  const cfg = authConfig();
  const fail = (error: string) => {
    const res = NextResponse.redirect(`${origin}/login?error=${error}`);
    res.cookies.set(STATE_COOKIE, "", { path: "/api/auth", maxAge: 0 });
    return res;
  };
  if (!cfg) return fail("config");

  const url = new URL(req.url);
  if (url.searchParams.get("error")) return fail("denied");

  const cookie = (req.headers.get("cookie") ?? "").match(new RegExp(`${STATE_COOKIE}=([^;]+)`))?.[1] ?? "";
  const [state, encodedNext] = cookie.split(".");
  const given = url.searchParams.get("state") ?? "";
  const code = url.searchParams.get("code");
  if (!state || !code || !safeEqual(state, given)) return fail("state");

  const profile = await fetchProfile({ code, clientId: cfg.clientId, clientSecret: cfg.clientSecret, redirectUri: `${origin}${LOGIN_CALLBACK_PATH}` }).catch(() => null);
  if (!profile) return fail("google");
  if (!profile.emailVerified) return fail("unverified");
  if (!isEmailAllowed(profile.email, cfg.allowedEmails)) return fail("forbidden");

  const uid = userIdFromSub(profile.sub);
  await mutate((db) => {
    const now = nowIso();
    const known = db.users.find((u) => u.id === uid);
    if (known) Object.assign(known, { email: profile.email, name: profile.name, picture: profile.picture, lastLoginAt: now });
    else db.users.push({ id: uid, email: profile.email, name: profile.name, picture: profile.picture, createdAt: now, lastLoginAt: now });
  });

  const token = await signSession({ uid, email: profile.email, name: profile.name, picture: profile.picture }, cfg.secret);
  const res = NextResponse.redirect(`${origin}${safeNext(decodeURIComponent(encodedNext ?? ""))}`);
  res.cookies.set(SESSION_COOKIE, token, { httpOnly: true, secure: origin.startsWith("https"), sameSite: "lax", path: "/", maxAge: SESSION_DAYS * 86_400 });
  res.cookies.set(STATE_COOKIE, "", { path: "/api/auth", maxAge: 0 });
  return res;
}
