import "server-only";
import { currentUserId } from "./current-user";
import { publisherMode } from "./publisher";
import { loadDb, scoped, storageMode } from "./store";

/** The signed-in user's data, and nothing else. A new user starts completely empty. */
export async function getData() {
  const userId = await currentUserId();
  return { userId, db: scoped(await loadDb(), userId) };
}

/** True while some network is still simulated: nothing is really published there. */
export const isDryRun = () => publisherMode() === "dry-run";

/** True on serverless hosts where the local JSON store lives in /tmp and is wiped between instances. */
export const isEphemeralStore = () => !!process.env.VERCEL && storageMode() === "file" && !process.env.GRIDCAST_DATA_DIR;
