import { NextResponse } from "next/server";
import { appOrigin } from "@/lib/oauth/google";
import { SESSION_COOKIE } from "@/lib/session";

/** POST only: a plain link must not be able to sign someone out. 303 sends the browser on to /login with a GET. */
export async function POST(req: Request) {
  const res = NextResponse.redirect(`${appOrigin(req)}/login`, 303);
  res.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
