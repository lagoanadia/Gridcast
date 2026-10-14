import { mediaStorageEnabled } from "../media-storage";
import type { Platform, PlatformAccount } from "../types";
import { DryRunPublisher } from "./dry-run";
import { InstagramPublisher } from "./instagram";
import type { Publisher, PublishRequest, PublishResult } from "./types";

export type { Publisher, PublishRequest, PublishResult } from "./types";

export type PublisherMode = "dry-run" | "live";

/**
 * "live" really publishes; "dry-run" only simulates. PUBLISHER_MODE forces one; otherwise it is live
 * as soon as cloud storage exists, because networks download the file from a public URL.
 */
export function publisherMode(env: Record<string, string | undefined> = process.env): PublisherMode {
  if (env.PUBLISHER_MODE === "dry-run" || env.PUBLISHER_MODE === "live") return env.PUBLISHER_MODE;
  return mediaStorageEnabled(env) ? "live" : "dry-run";
}

/** Networks Gridcast can really publish to today. */
export const LIVE_PLATFORMS: Platform[] = ["instagram"];

/** Can a post to this account go out right now? In live mode the account must be connected and the network supported. */
export function availability(platform: Platform, account: PlatformAccount | undefined, mode: PublisherMode = publisherMode(), env: Record<string, string | undefined> = process.env):
  { ok: true } | { ok: false; reason: "soon" | "connect" } {
  if (mode === "dry-run") return { ok: true };
  if (!LIVE_PLATFORMS.includes(platform)) return { ok: false, reason: "soon" };
  if (account?.connected && account.tokenEncrypted) return { ok: true };
  if (platform === "instagram" && env.INSTAGRAM_ACCESS_TOKEN) return { ok: true };
  return { ok: false, reason: "connect" };
}

/** Real publishers where they exist. Anything else fails loudly: it must never pretend to have published. */
class LivePublisher implements Publisher {
  readonly name = "live";
  readonly dryRun = false;
  private instagram = new InstagramPublisher();
  supports(platform: Platform) { return LIVE_PLATFORMS.includes(platform); }
  async publish(req: PublishRequest): Promise<PublishResult> {
    if (req.post.platform === "instagram") return this.instagram.publish(req);
    return { ok: false, error: `Todavía no se puede publicar en ${req.post.platform} desde Gridcast.`, retryable: false };
  }
}

export function getPublisher(): Publisher {
  return publisherMode() === "live" ? new LivePublisher() : new DryRunPublisher();
}
