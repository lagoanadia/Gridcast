import type { Platform, Post, Template, Video } from "../types";

export interface PublishRequest {
  post: Post;
  video: Video;
  template?: Template;
  /** Absolute path or signed URL of the media file. */
  mediaUrl: string;
}

export type PublishResult =
  | { ok: true; externalId: string; externalUrl: string; dryRun: boolean }
  | { ok: false; error: string; retryable: boolean };

/**
 * Every publishing backend (dry-run, Ayrshare, native YouTube/TikTok/Instagram APIs)
 * implements this interface. The rest of the app only talks to `Publisher`.
 */
export interface Publisher {
  readonly name: string;
  readonly dryRun: boolean;
  supports(platform: Platform): boolean;
  publish(req: PublishRequest): Promise<PublishResult>;
}
