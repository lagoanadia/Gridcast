import type { Platform, Post, Video } from "./types";

/**
 * Platform limits for short-form vertical video.
 * ⚠ These change often — re-verify against each platform's docs before launch.
 */
export interface PlatformLimits {
  label: string;
  maxDurationSec: number;
  maxFileBytes: number;
  titleMax: number | null; // null = platform has no separate title field
  descriptionMax: number;
  maxHashtags: number;
}

const GB = 1024 ** 3;
const MB = 1024 ** 2;

export const PLATFORM_LIMITS: Record<Platform, PlatformLimits> = {
  youtube: {
    label: "YouTube Shorts",
    maxDurationSec: 180,
    maxFileBytes: 256 * GB,
    titleMax: 100,
    descriptionMax: 5000,
    maxHashtags: 15, // YouTube ignores all hashtags if more than 15
  },
  tiktok: {
    label: "TikTok",
    maxDurationSec: 600,
    maxFileBytes: 4 * GB,
    titleMax: null,
    descriptionMax: 2200, // caption incl. hashtags
    maxHashtags: 30,
  },
  instagram: {
    label: "Instagram Reels",
    maxDurationSec: 180,
    maxFileBytes: 300 * MB,
    titleMax: null,
    descriptionMax: 2200, // caption incl. hashtags
    maxHashtags: 30,
  },
};

export interface ValidationIssue {
  field: "aspect" | "duration" | "file" | "title" | "description" | "hashtags" | "expiry" | "schedule";
  severity: "error" | "warning";
  messageKey: string;
  params?: Record<string, string | number>;
}

/** Final caption as it will be sent (platforms without a title field get title + description + hashtags). */
export function composeCaption(post: Pick<Post, "platform" | "title" | "description" | "hashtags">): string {
  const tags = post.hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ");
  const parts = PLATFORM_LIMITS[post.platform].titleMax === null
    ? [post.title, post.description, tags]
    : [post.description, tags];
  return parts.filter((p) => p && p.trim()).join("\n\n");
}

export function validatePost(post: Post, video: Video): ValidationIssue[] {
  const lim = PLATFORM_LIMITS[post.platform];
  const issues: ValidationIssue[] = [];

  const isImage = video.mediaType === "image";

  if (isImage && post.platform === "youtube") {
    issues.push({ field: "file", severity: "error", messageKey: "validation.imageUnsupported" });
  }

  if (video.width && video.height) {
    const ratio = video.width / video.height;
    if (isImage) {
      // Instagram feed photos: from 4:5 (portrait) to 1.91:1 (landscape).
      if (ratio < 0.8 - 0.01 || ratio > 1.91 + 0.01) {
        issues.push({ field: "aspect", severity: "error", messageKey: "validation.aspectImage", params: { w: video.width, h: video.height } });
      }
    } else if (Math.abs(ratio - 9 / 16) > 0.02) {
      issues.push({ field: "aspect", severity: "error", messageKey: "validation.aspect", params: { w: video.width, h: video.height } });
    }
  } else {
    issues.push({ field: "aspect", severity: "warning", messageKey: "validation.aspectUnknown" });
  }

  if (!isImage) {
    if (video.durationSec !== undefined) {
      if (video.durationSec > lim.maxDurationSec) {
        issues.push({ field: "duration", severity: "error", messageKey: "validation.duration", params: { max: lim.maxDurationSec, actual: Math.round(video.durationSec) } });
      }
    } else {
      issues.push({ field: "duration", severity: "warning", messageKey: "validation.durationUnknown" });
    }
  }

  if (!video.filePath) {
    issues.push({ field: "file", severity: "error", messageKey: "validation.noFile" });
  } else if (video.fileSizeBytes && video.fileSizeBytes > lim.maxFileBytes) {
    issues.push({ field: "file", severity: "error", messageKey: "validation.fileSize", params: { maxMb: Math.round(lim.maxFileBytes / MB) } });
  }

  if (!post.title.trim()) {
    issues.push({ field: "title", severity: "error", messageKey: "validation.titleEmpty" });
  }
  if (lim.titleMax !== null && post.title.length > lim.titleMax) {
    issues.push({ field: "title", severity: "error", messageKey: "validation.titleLength", params: { max: lim.titleMax, actual: post.title.length } });
  }

  const descLen = composeCaption(post).length;
  if (descLen > lim.descriptionMax) {
    issues.push({ field: "description", severity: "error", messageKey: "validation.descriptionLength", params: { max: lim.descriptionMax, actual: descLen } });
  }

  if (post.hashtags.length > lim.maxHashtags) {
    issues.push({ field: "hashtags", severity: "error", messageKey: "validation.hashtags", params: { max: lim.maxHashtags, actual: post.hashtags.length } });
  }

  if (post.scheduledAt && video.expiresAt && new Date(post.scheduledAt) > new Date(video.expiresAt)) {
    issues.push({ field: "expiry", severity: "error", messageKey: "validation.expired" });
  }

  return issues;
}

export const hasErrors = (issues: ValidationIssue[]) => issues.some((i) => i.severity === "error");
