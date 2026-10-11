import { DryRunPublisher } from "./dry-run";
import type { Publisher } from "./types";

export type { Publisher, PublishRequest, PublishResult } from "./types";

/** Resolve the publisher from PUBLISHER_MODE. Defaults to dry-run so nothing is ever published by accident. */
export function getPublisher(): Publisher {
  const mode = process.env.PUBLISHER_MODE ?? "dry-run";
  switch (mode) {
    case "dry-run":
      return new DryRunPublisher();
    case "ayrshare":
      throw new Error("Ayrshare publisher arrives in Phase 2. Set PUBLISHER_MODE=dry-run.");
    default:
      throw new Error(`Unknown PUBLISHER_MODE "${mode}"`);
  }
}
