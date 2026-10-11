import { addDaysYmd, zonedParts, zonedToUtc } from "./time";
import type { Channel, Platform, Post, QueueRule, Video } from "./types";

export interface PlannedSlot {
  videoId: string;
  platforms: Platform[];
  scheduledAt: string;
  ruleId: string;
}

const ACTIVE: Post["status"][] = ["proposed", "scheduled", "publishing", "published"];

/** Generate the upcoming publishing slots for a channel from its rules. */
export function generateSlots(channel: Channel, rules: QueueRule[], now: Date, horizonDays: number) {
  const today = zonedParts(now, channel.timezone);
  const slots: { at: Date; rule: QueueRule }[] = [];
  for (const rule of rules) {
    if (!rule.active || rule.channelId !== channel.id) continue;
    for (let i = 0; i <= horizonDays; i++) {
      const day = addDaysYmd(today.y, today.m, today.d, i);
      if (!rule.daysOfWeek.includes(day.dow)) continue;
      for (const t of rule.times) {
        const [hh, mm] = t.split(":").map(Number);
        const at = zonedToUtc(day.y, day.m, day.d, hh, mm, channel.timezone);
        if (at > now) slots.push({ at, rule });
      }
    }
  }
  return slots.sort((a, b) => a.at.getTime() - b.at.getTime());
}

/**
 * Assigns "ready" videos with no active posts to free slots, in upload order.
 * Pure function: returns a plan; the caller persists it as `proposed` posts
 * (or `scheduled` when the channel is on autopilot).
 */
export function planQueue(args: {
  channel: Channel;
  rules: QueueRule[];
  videos: Video[];
  posts: Post[];
  now: Date;
  horizonDays: number;
}): { plan: PlannedSlot[]; skippedExpired: string[] } {
  const { channel, rules, videos, posts, now, horizonDays } = args;
  const channelPosts = posts.filter((p) => p.channelId === channel.id && ACTIVE.includes(p.status));
  const taken = new Set(channelPosts.map((p) => p.scheduledAt && new Date(p.scheduledAt).getTime()));
  const queued = new Set(channelPosts.map((p) => p.videoId));

  let pending = videos
    .filter((v) => v.channelId === channel.id && v.status === "ready" && !queued.has(v.id))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const plan: PlannedSlot[] = [];
  const skippedExpired = new Set<string>();

  for (const slot of generateSlots(channel, rules, now, horizonDays)) {
    if (!pending.length) break;
    if (taken.has(slot.at.getTime())) continue;
    const idx = pending.findIndex((v) => !v.expiresAt || new Date(v.expiresAt) > slot.at);
    // Videos that expire before this slot can never be placed later either.
    pending.slice(0, idx === -1 ? pending.length : idx).forEach((v) => skippedExpired.add(v.id));
    if (idx === -1) { pending = []; break; }
    const video = pending[idx];
    pending = pending.slice(idx + 1);
    taken.add(slot.at.getTime());
    plan.push({ videoId: video.id, platforms: slot.rule.platforms, scheduledAt: slot.at.toISOString(), ruleId: slot.rule.id });
  }

  return { plan, skippedExpired: [...skippedExpired] };
}

/** Average videos per day the channel's rules consume. */
export function videosPerDay(channel: Channel, rules: QueueRule[]): number {
  return rules
    .filter((r) => r.active && r.channelId === channel.id)
    .reduce((sum, r) => sum + (r.times.length * r.daysOfWeek.length) / 7, 0);
}

/** How many days of content remain: queued-but-unpublished videos + ready unqueued videos. */
export function queueDaysLeft(channel: Channel, rules: QueueRule[], videos: Video[], posts: Post[], now: Date): number | null {
  const rate = videosPerDay(channel, rules);
  if (rate === 0) return null;
  const upcoming = new Set(
    posts
      .filter((p) => p.channelId === channel.id && (p.status === "proposed" || p.status === "scheduled") && p.scheduledAt && new Date(p.scheduledAt) > now)
      .map((p) => p.videoId),
  );
  const ready = videos.filter((v) => v.channelId === channel.id && v.status === "ready" && !upcoming.has(v.id)).length;
  return Math.floor(((upcoming.size + ready) / rate) * 10) / 10;
}
