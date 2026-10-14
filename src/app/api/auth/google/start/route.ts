import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { authConfig, safeNext } from "@/lib/auth";
import { appOrigin } from "@/lib/oauth/google";
import { buildLoginUrl, LOGIN_CALLBACK_PATH } from "@/lib/oauth/google-login";

const STATE_COOKIE = "gc_login";

/** Step 1: send the person to Google. The state (anti-forgery token + where to go afterwards) rides in a short-lived cookie. */
export async function GET(req: Request) {
  const origin = appOrigin(req);
  const cfg = authConfig();
  if (!cfg) return NextResponse.redirect(`${origin}/login?error=config`);

  const next = safeNext(new URL(req.url).searchParams.get("next"));
  const state = randomBytes(24).toString("hex");
  const res = NextResponse.redirect(buildLoginUrl({ clientId: cfg.clientId, redirectUri: `${origin}${LOGIN_CALLBACK_PATH}`, state }));
  res.cookies.set(STATE_COOKIE, `${state}.${encodeURIComponent(next)}`, { httpOnly: true, secure: origin.startsWith("https"), sameSite: "lax", path: "/api/auth", maxAge: 600 });
  return res;
}
