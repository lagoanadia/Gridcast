import { QUEUE_HORIZON_DAYS } from "@/config";
import { hasErrors, validatePost, type ValidationIssue } from "./platforms";
import { generateSlots } from "./scheduler";
import { newId, nowIso } from "./store";
import { buildPostDraft } from "./templates";
import { zonedToUtc } from "./time";
import { PLATFORMS, type Database, type Platform, type Post } from "./types";

export type WhenMode = "now" | "at" | "next" | "draft";

export interface CreateInput {
  videoId: string;
  title: string;
  description: string;
  hashtags: string[];
  platforms: Platform[];
  mode: WhenMode;
  /** Wall-clock "YYYY-MM-DDTHH:MM" in the channel's time zone (mode "at"). */
  whenLocal?: string;
}

export type CreateResult =
  | { ok: true; posts: number; scheduledAt?: string }
  | { ok: false; reason: "not_found" | "no_platforms" | "no_time" | "past" | "no_slot" | "invalid"; issues?: ValidationIssue[] };

/**
 * Finishes the "Crear" wizard for an already stored file: saves its text, then either keeps it as a draft
 * or creates one approved post per chosen platform. Nothing is changed unless every post is valid.
 */
export function createContent(db: Database, userId: string, input: CreateInput, now: Date): CreateResult {
  const video = db.videos.find((v) => v.id === input.videoId && v.userId === userId);
  const channel = video && db.channels.find((c) => c.id === video.channelId && c.userId === userId);
  if (!video || !channel) return { ok: false, reason: "not_found" };

  const apply = () => {
    video.title = input.title.trim() || video.title;
    video.description = input.description.trim();
  };

  if (input.mode === "draft") {
    apply();
    video.status = "draft";
    return { ok: true, posts: 0 };
  }

  const platforms = Array.from(new Set(input.platforms)).filter((p) => PLATFORMS.includes(p));
  if (platforms.length === 0) return { ok: false, reason: "no_platforms" };

  let at: Date;
  if (input.mode === "now") {
    at = now;
  } else if (input.mode === "at") {
    const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(input.whenLocal ?? "");
    if (!m) return { ok: false, reason: "no_time" };
    at = zonedToUtc(+m[1], +m[2], +m[3], +m[4], +m[5], channel.timezone);
    if (at <= now) return { ok: false, reason: "past" };
  } else {
    const taken = new Set(
      db.posts
        .filter((p) => p.channelId === channel.id && ["proposed", "scheduled", "publishing", "published"].includes(p.status) && p.scheduledAt)
        .map((p) => new Date(p.scheduledAt!).getTime()),
    );
    const slot = generateSlots(channel, db.queueRules.filter((r) => r.userId === userId), now, QUEUE_HORIZON_DAYS).find((s) => !taken.has(s.at.getTime()));
    if (!slot) return { ok: false, reason: "no_slot" };
    at = slot.at;
  }

  // Validate against the edited text, without touching the stored video until everything passes.
  const preview = { ...video, title: input.title.trim() || video.title, description: input.description.trim() };
  const posts: Post[] = platforms.map((platform) => {
    const tpl = db.templates.find((t) => t.userId === userId && t.channelId === channel.id && t.platform === platform);
    return {
      id: newId(), userId, createdAt: nowIso(), videoId: video.id, channelId: channel.id, platform,
      ...buildPostDraft(preview, platform, tpl, input.hashtags),
      scheduledAt: at.toISOString(), status: "scheduled", attempts: 0,
    };
  });
  const issues = posts.flatMap((p) => validatePost(p, preview));
  if (hasErrors(issues)) return { ok: false, reason: "invalid", issues };

  apply();
  video.status = "scheduled";
  db.posts.push(...posts);
  return { ok: true, posts: posts.length, scheduledAt: at.toISOString() };
}
