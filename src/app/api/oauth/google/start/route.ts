import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { getData } from "@/lib/data";
import { appOrigin, buildAuthUrl, CALLBACK_PATH } from "@/lib/oauth/google";

export const STATE_COOKIE = "gc_oauth_google";

/** Step 1: send the owner to Google's consent screen. The state (CSRF token + channel id) travels in a short-lived cookie. */
export async function GET(req: Request) {
  const origin = appOrigin(req);
  const channelId = new URL(req.url).searchParams.get("channelId") ?? "";
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const { db } = getData();
  if (!clientId || !process.env.GOOGLE_CLIENT_SECRET) return NextResponse.redirect(`${origin}/channels?err=${encodeURIComponent("Google no está configurado en este servidor (faltan GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET).")}`);
  if (!db.channels.some((c) => c.id === channelId)) return NextResponse.redirect(`${origin}/channels?err=${encodeURIComponent("No se ha encontrado la cuenta.")}`);

  const state = randomBytes(24).toString("hex");
  const res = NextResponse.redirect(buildAuthUrl({ clientId, redirectUri: `${origin}${CALLBACK_PATH}`, state }));
  res.cookies.set(STATE_COOKIE, `${state}.${channelId}`, { httpOnly: true, secure: origin.startsWith("https"), sameSite: "lax", path: "/api/oauth/google", maxAge: 600 });
  return res;
}
