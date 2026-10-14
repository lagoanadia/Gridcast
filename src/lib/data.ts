import "server-only";
import { publisherMode } from "./publisher";
import { seedDb } from "./seed";
import { currentUserId, loadDb, mutate, scoped, storageMode } from "./store";

/**
 * Load the current user's data. The first run seeds the owner's accounts, templates and queue rules.
 * Demo videos and fake posts are only added when there is no permanent storage, so a real database starts clean.
 */
export async function getData() {
  const userId = currentUserId();
  let db = await loadDb();
  if (!db.channels.some((c) => c.userId === userId)) {
    const demo = storageMode() === "file";
    await mutate((d) => seedDb(d, userId, new Date(), demo, demo));
    db = await loadDb();
  }
  return { userId, db: scoped(db, userId) };
}

/** True while some network is still simulated: nothing is really published there. */
export const isDryRun = () => publisherMode() === "dry-run";

/** True on serverless hosts where the local JSON store lives in /tmp and is wiped between instances. */
export const isEphemeralStore = () => !!process.env.VERCEL && storageMode() === "file" && !process.env.GRIDCAST_DATA_DIR;
