import "server-only";
import { cookies } from "next/headers";
import { authConfig } from "./auth";
import { SESSION_COOKIE, verifySession, type SessionUser } from "./session";
import { devUserId } from "./store";

export class UnauthorizedError extends Error {
  constructor() { super("Not signed in"); }
}

/** The signed-in user, or null (also null when login is not configured). */
export async function currentUser(): Promise<SessionUser | null> {
  const cfg = authConfig();
  if (!cfg) return null;
  return verifySession((await cookies()).get(SESSION_COOKIE)?.value, cfg.secret);
}

/**
 * Id of whoever is making this request. Every row in the database carries it, so each person only ever sees their own data.
 * With login off (local development) everything belongs to a single development user.
 */
export async function currentUserId(): Promise<string> {
  if (!authConfig()) return devUserId();
  const user = await currentUser();
  if (!user) throw new UnauthorizedError();
  return user.uid;
}
