export type Platform = "youtube" | "tiktok" | "instagram";
export const PLATFORMS: Platform[] = ["youtube", "tiktok", "instagram"];

export type VideoStatus = "draft" | "ready" | "scheduled" | "published";
export const VIDEO_STATUSES: VideoStatus[] = ["draft", "ready", "scheduled", "published"];

/**
 * proposed  → created by the queue/agent, waiting for the owner's approval
 * scheduled → approved; will be published at scheduledAt
 * publishing/published/failed → publisher lifecycle
 */
export type PostStatus = "proposed" | "scheduled" | "publishing" | "published" | "failed" | "cancelled";

/** Every row carries userId so the data model maps 1:1 to Supabase tables with RLS. */
interface Owned {
  id: string;
  userId: string;
  createdAt: string;
}

export interface PlatformAccount {
  platform: Platform;
  handle: string;
  /** Encrypted with TOKEN_ENCRYPTION_KEY; never stored or logged in clear text. */
  tokenEncrypted?: string;
  connected: boolean;
}

export interface Channel extends Owned {
  name: string;
  slug: string;
  color: string;
  timezone: string;
  autopilot: boolean;
  /** Alert when fewer than this many days of content remain in the queue. */
  lowQueueThresholdDays: number;
  accounts: PlatformAccount[];
}

export interface Template extends Owned {
  channelId: string;
  platform: Platform;
  fixedHashtags: string[];
  descriptionFooter: string;
  youtubeCategoryId?: string;
  language: string;
  madeForKids: boolean;
  playlistId?: string;
  toneOfVoice: string;
}

export interface Video extends Owned {
  channelId: string;
  title: string;
  description: string;
  fileName?: string;
  filePath?: string;
  fileSizeBytes?: number;
  durationSec?: number;
  width?: number;
  height?: number;
  transcript?: string;
  status: VideoStatus;
  formatTags: string[];
  /** After this date the content is no longer relevant. */
  expiresAt?: string;
}

export interface Post extends Owned {
  videoId: string;
  channelId: string;
  platform: Platform;
  title: string;
  description: string;
  hashtags: string[];
  scheduledAt?: string;
  status: PostStatus;
  attempts: number;
  nextAttemptAt?: string;
  externalId?: string;
  externalUrl?: string;
  error?: string;
  publishedAt?: string;
  dryRun?: boolean;
  queueRuleId?: string;
}

export interface QueueRule extends Owned {
  channelId: string;
  /** Local times in the channel timezone, "HH:MM". One video per time. */
  times: string[];
  /** 0 = Sunday … 6 = Saturday */
  daysOfWeek: number[];
  platforms: Platform[];
  active: boolean;
}

export interface MetricSnapshot extends Owned {
  postId: string;
  window: "24h" | "7d" | "28d";
  views: number;
  avgViewDurationSec?: number;
  retentionPct?: number;
  likes: number;
  comments: number;
  shares: number;
  subscribersGained: number;
}

export interface Notification extends Owned {
  kind: "low_queue" | "publish_failed" | "publish_retry" | "expiry";
  channelId?: string;
  postId?: string;
  message: string;
  channel: "in_app" | "email" | "telegram";
  read: boolean;
}

export interface Database {
  channels: Channel[];
  templates: Template[];
  videos: Video[];
  posts: Post[];
  queueRules: QueueRule[];
  metrics: MetricSnapshot[];
  notifications: Notification[];
}
