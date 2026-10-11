import "server-only";
import { seedDb } from "./seed";
import { currentUserId, loadDb, mutate, scoped } from "./store";

/** Load the current user's data. First run auto-seeds the owner's channels so the app is usable immediately. */
export function getData() {
  const userId = currentUserId();
  let db = loadDb();
  if (!db.channels.some((c) => c.userId === userId)) {
    mutate((d) => seedDb(d, userId));
    db = loadDb();
  }
  return { userId, db: scoped(db, userId) };
}

export const isDryRun = () => (process.env.PUBLISHER_MODE ?? "dry-run") === "dry-run";

/** True on serverless hosts where the local JSON store lives in /tmp and is wiped between instances. */
export const isEphemeralStore = () => !!process.env.VERCEL && !process.env.GRIDCAST_DATA_DIR;
