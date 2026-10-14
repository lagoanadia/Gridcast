import "server-only";
import { currentUser, currentUserId } from "./current-user";
import { publisherMode } from "./publisher";
import { loadDb, mutate, newId, nowIso, scoped, storageMode } from "./store";
import { PLATFORMS } from "./types";

/** The signed-in user's data, and nothing else. A new user starts completely empty. */
export async function getData() {
  const userId = await currentUserId();
  await ensureFirstChannel(userId);
  return { userId, db: scoped(await loadDb(), userId) };
}

/** True while some network is still simulated: nothing is really published there. */
export const isDryRun = () => publisherMode() === "dry-run";

/** True on serverless hosts where the local JSON store lives in /tmp and is wiped between instances. */
export const isEphemeralStore = () => !!process.env.VERCEL && storageMode() === "file" && !process.env.GRIDCAST_DATA_DIR;

/** A signed-in user with no account yet gets one named after them, so they never have to create it by hand. */
async function ensureFirstChannel(userId: string) {
  const user = await currentUser();
  if (!user) return;
  const name = (user.name || user.email.split("@")[0] || "Mi cuenta").slice(0, 60);
  await mutate((db) => {
    if (db.channels.some((c) => c.userId === userId)) return;
    db.channels.push({
      id: newId(), userId, createdAt: nowIso(), name, slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "") || "cuenta",
      color: "#6c47ff", timezone: "Europe/Madrid", autopilot: false, lowQueueThresholdDays: 5,
      accounts: PLATFORMS.map((platform) => ({ platform, handle: "", connected: false })),
    });
  });
}
