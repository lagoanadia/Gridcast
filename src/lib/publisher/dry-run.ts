import { composeCaption } from "../platforms";
import type { Publisher, PublishRequest, PublishResult } from "./types";

/** Never contacts any platform. Logs what would be sent and returns a fake id. */
export class DryRunPublisher implements Publisher {
  readonly name = "dry-run";
  readonly dryRun = true;
  /** Optional hook for tests to simulate failures. */
  constructor(private failWith?: (req: PublishRequest) => string | undefined) {}

  supports() {
    return true;
  }

  async publish(req: PublishRequest): Promise<PublishResult> {
    const err = this.failWith?.(req);
    if (err) return { ok: false, error: err, retryable: true };
    const externalId = `dry_${req.post.platform}_${req.post.id.slice(0, 8)}`;
    if (process.env.NODE_ENV !== "test") {
      console.info(`[dry-run] would publish to ${req.post.platform}:`, {
        title: req.post.title,
        caption: composeCaption(req.post),
        media: req.mediaUrl,
      });
    }
    return { ok: true, externalId, externalUrl: `https://example.invalid/${externalId}`, dryRun: true };
  }
}
