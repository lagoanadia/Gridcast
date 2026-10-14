import { NextResponse, type NextRequest } from "next/server";
import { authConfig, isPublicPath } from "@/lib/auth";
import { SESSION_COOKIE, verifySession } from "@/lib/session";

/**
 * With Google login configured, every page and API needs a valid session cookie except the public ones
 * (login, auth callbacks, the scheduler tick which has its own secret, PWA assets, TikTok's verification file).
 * Without login configured the app is open: that is how local development runs.
 */
export async function middleware(req: NextRequest) {
  const cfg = authConfig();
  if (!cfg) return NextResponse.next();

  const { pathname } = req.nextUrl;
  if (isPublicPath(pathname)) return NextResponse.next();
  if (await verifySession(req.cookies.get(SESSION_COOKIE)?.value, cfg.secret)) return NextResponse.next();

  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + req.nextUrl.search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  // Static assets are never gated; everything else goes through the checks above.
  matcher: ["/((?!_next/static|_next/image).*)"],
};
