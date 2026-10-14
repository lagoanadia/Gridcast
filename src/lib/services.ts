import { PUBLISH_RETRY, QUEUE_HORIZON_DAYS } from "@/config";
import { hasErrors, validatePost } from "./platforms";
import type { Publisher } from "./publisher";
import { planQueue, queueDaysLeft } from "./scheduler";
import { newId } from "./store";
import { buildPostDraft } from "./templates";
import type { Database, Notification, Post, Video } from "./types";

/**
 * Domain operations. They take a Database object (already loaded) so they are
 * fully testable and storage-agnostic; callers persist the result.
 */

function notify(db: Database, userId: string, n: Omit<Notification, "id" | "userId" | "createdAt" | "read" | "channel"> & { channel?: Notification["channel"] }, now: Date) {
  db.notifications.push({ id: newId(), userId, createdAt: now.toISOString(), read: false, channel: n.channel ?? "in_app", ...n });
}

/** Create platform versions for every free queue slot. Posts are `proposed` unless the channel is on autopilot. */
export function fillQueue(db: Database, userId: string, now: Date) {
  let created = 0;
  for (const channel of db.channels.filter((c) => c.userId === userId)) {
    const { plan, skippedExpired } = planQueue({
      channel,
      rules: db.queueRules.filter((r) => r.userId === userId),
      videos: db.videos.filter((v) => v.userId === userId),
      posts: db.posts.filter((p) => p.userId === userId),
      now,
      horizonDays: QUEUE_HORIZON_DAYS,
    });
    for (const slot of plan) {
      const video = db.videos.find((v) => v.id === slot.videoId)!;
      for (const platform of slot.platforms) {
        const template = db.templates.find((t) => t.userId === userId && t.channelId === channel.id && t.platform === platform);
        const post: Post = {
          id: newId(), userId, createdAt: now.toISOString(),
          videoId: video.id, channelId: channel.id, platform,
          ...buildPostDraft(video, platform, template),
          scheduledAt: slot.scheduledAt, status: "proposed", attempts: 0, queueRuleId: slot.ruleId,
        };
        db.posts.push(post);
        created++;
        if (channel.autopilot && !hasErrors(validatePost(post, video))) {
          post.status = "scheduled";
          video.status = "scheduled";
        }
      }
    }
    for (const vid of skippedExpired) {
      const v = db.videos.find((x) => x.id === vid)!;
      notify(db, userId, { kind: "expiry", channelId: channel.id, message: `"${v.title}" expires before the next free slot and was not queued.` }, now);
    }
  }
  return created;
}

export type ApproveResult = { ok: true } | { ok: false; reason: string };

/** Approve a proposed post. Blocked if validation has errors. */
export function approvePost(db: Database, userId: string, postId: string): ApproveResult {
  const post = db.posts.find((p) => p.id === postId && p.userId === userId);
  if (!post) return { ok: false, reason: "not_found" };
  if (post.status !== "proposed") return { ok: false, reason: "not_proposed" };
  if (!post.scheduledAt) return { ok: false, reason: "no_time" };
  const video = db.videos.find((v) => v.id === post.videoId)!;
  if (hasErrors(validatePost(post, video))) return { ok: false, reason: "invalid" };
  post.status = "scheduled";
  video.status = "scheduled";
  return { ok: true };
}

export function unschedulePost(db: Database, userId: string, postId: string) {
  const post = db.posts.find((p) => p.id === postId && p.userId === userId);
  if (!post || (post.status !== "proposed" && post.status !== "scheduled" && post.status !== "failed")) return false;
  post.status = "cancelled";
  syncVideoStatus(db, post.videoId);
  return true;
}

/** Drag-and-drop on the calendar. Moving an approved post sends it back to `proposed` unless on autopilot. */
export function movePost(db: Database, userId: string, postId: string, scheduledAt: string) {
  const post = db.posts.find((p) => p.id === postId && p.userId === userId);
  if (!post || !["proposed", "scheduled", "failed"].includes(post.status)) return false;
  // Move all platform versions of the same video that shared the slot, so they stay together.
  const siblings = db.posts.filter(
    (p) => p.videoId === post.videoId && p.scheduledAt === post.scheduledAt && ["proposed", "scheduled", "failed"].includes(p.status),
  );
  const channel = db.channels.find((c) => c.id === post.channelId);
  for (const p of siblings) {
    p.scheduledAt = scheduledAt;
    p.attempts = 0;
    p.error = undefined;
    p.nextAttemptAt = undefined;
    if (!channel?.autopilot) p.status = "proposed";
    else if (p.status === "failed") p.status = "scheduled";
  }
  syncVideoStatus(db, post.videoId);
  return true;
}

export function syncVideoStatus(db: Database, videoId: string) {
  const video = db.videos.find((v) => v.id === videoId);
  if (!video || video.status === "draft") return;
  const posts = db.posts.filter((p) => p.videoId === videoId && p.status !== "cancelled");
  if (posts.length && posts.every((p) => p.status === "published")) video.status = "published";
  else if (posts.some((p) => p.status === "scheduled" || p.status === "publishing" || p.status === "published")) video.status = "scheduled";
  else video.status = "ready";
}

/** Put a video's failed posts back in the approved queue, due now, so the next publish run retries them. */
export function retryFailedPosts(db: Database, userId: string, videoId: string, now: Date) {
  let n = 0;
  for (const p of db.posts) {
    if (p.userId !== userId || p.videoId !== videoId || p.status !== "failed") continue;
    p.status = "scheduled";
    p.scheduledAt = now.toISOString();
    p.attempts = 0;
    p.error = undefined;
    p.nextAttemptAt = undefined;
    n++;
  }
  if (n) syncVideoStatus(db, videoId);
  return n;
}

/** Publish every approved post whose time has come. Handles retries with backoff. */
export async function runDuePublishes(db: Database, publisher: Publisher, now: Date, mediaUrl: (v: Video) => string) {
  const due = db.posts.filter(
    (p) =>
      (p.status === "scheduled" && p.scheduledAt && new Date(p.scheduledAt) <= now) ||
      (p.status === "failed" && p.nextAttemptAt && new Date(p.nextAttemptAt) <= now),
  );
  const results: { postId: string; ok: boolean }[] = [];
  for (const post of due) {
    const video = db.videos.find((v) => v.id === post.videoId)!;
    const template = db.templates.find((t) => t.channelId === post.channelId && t.platform === post.platform);
    const channel = db.channels.find((c) => c.id === post.channelId);

    // Safety net: never publish something past its expiry, or invalid.
    const issues = validatePost(post, video);
    if (hasErrors(issues)) {
      post.status = "failed";
      post.error = `Validation failed: ${issues.filter((i) => i.severity === "error").map((i) => i.field).join(", ")}`;
      post.nextAttemptAt = undefined;
      notify(db, post.userId, { kind: "publish_failed", channelId: post.channelId, postId: post.id, message: `${channel?.name ?? ""} · ${post.platform}: "${post.title}" — ${post.error}` }, now);
      results.push({ postId: post.id, ok: false });
      continue;
    }

    post.status = "publishing";
    post.attempts += 1;
    const account = channel?.accounts.find((a) => a.platform === post.platform);
    const res = await publisher.publish({ post, video, template, account, mediaUrl: mediaUrl(video) });
    if (res.ok) {
      Object.assign(post, { status: "published", externalId: res.externalId, externalUrl: res.externalUrl, publishedAt: now.toISOString(), dryRun: res.dryRun, error: undefined, nextAttemptAt: undefined });
      results.push({ postId: post.id, ok: true });
    } else {
      post.status = "failed";
      post.error = res.error;
      const canRetry = res.retryable && post.attempts < PUBLISH_RETRY.maxAttempts;
      post.nextAttemptAt = canRetry
        ? new Date(now.getTime() + PUBLISH_RETRY.backoffMinutes[post.attempts - 1] * 60_000).toISOString()
        : undefined;
      notify(db, post.userId, {
        kind: canRetry ? "publish_retry" : "publish_failed", channelId: post.channelId, postId: post.id,
        message: canRetry
          ? `${channel?.name ?? ""} · ${post.platform}: "${post.title}" failed (attempt ${post.attempts}), retrying. ${res.error}`
          : `${channel?.name ?? ""} · ${post.platform}: "${post.title}" failed after ${post.attempts} attempts. ${res.error}`,
      }, now);
      results.push({ postId: post.id, ok: false });
    }
    syncVideoStatus(db, post.videoId);
  }
  return results;
}

/** Raise a low-queue alert per channel at most once per day. */
export function checkLowQueue(db: Database, userId: string, now: Date) {
  const raised: string[] = [];
  const today = now.toISOString().slice(0, 10);
  for (const channel of db.channels.filter((c) => c.userId === userId)) {
    const days = queueDaysLeft(channel, db.queueRules, db.videos, db.posts, now);
    if (days === null || days >= channel.lowQueueThresholdDays) continue;
    const already = db.notifications.some((n) => n.kind === "low_queue" && n.channelId === channel.id && n.createdAt.slice(0, 10) === today);
    if (already) continue;
    notify(db, userId, { kind: "low_queue", channelId: channel.id, message: `${channel.name} has ${days} days of videos left.` }, now);
    raised.push(channel.id);
  }
  return raised;
}
