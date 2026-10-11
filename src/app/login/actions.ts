"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { safeEqual, SESSION_COOKIE, sessionToken } from "@/lib/session";

export async function loginAction(f: FormData) {
  const password = process.env.APP_PASSWORD;
  const next = String(f.get("next") ?? "/");
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/";
  if (!password || !safeEqual(String(f.get("password") ?? ""), password)) {
    redirect(`/login?error=1&next=${encodeURIComponent(safeNext)}`);
  }
  (await cookies()).set(SESSION_COOKIE, await sessionToken(password), {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 90,
  });
  redirect(safeNext);
}
