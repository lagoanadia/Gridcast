import { NextResponse, type NextRequest } from "next/server";
import { safeEqual, SESSION_COOKIE, sessionToken } from "@/lib/session";

/**
 * When APP_PASSWORD is set, every page and API needs a session cookie.
 * On Vercel the gate is mandatory: without APP_PASSWORD the app refuses to serve.
 */
export async function middleware(req: NextRequest) {
  const password = process.env.APP_PASSWORD;
  if (!password) {
    if (process.env.VERCEL) return new NextResponse("Set the APP_PASSWORD environment variable to enable GridCast.", { status: 503 });
    return NextResponse.next();
  }
  const cookie = req.cookies.get(SESSION_COOKIE)?.value;
  if (cookie && safeEqual(cookie, await sessionToken(password))) return NextResponse.next();

  if (req.nextUrl.pathname.startsWith("/api/")) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = `?next=${encodeURIComponent(req.nextUrl.pathname)}`;
  return NextResponse.redirect(url);
}

export const config = {
  // Public: login, PWA assets, Next internals, and the cron endpoint (it has its own CRON_SECRET).
  matcher: ["/((?!login|offline|api/cron|_next/|icons/|sw\\.js|manifest\\.webmanifest|icon\\.svg|favicon\\.ico).*)"],
};
