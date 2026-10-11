import { PLATFORM_LIMITS } from "./platforms";
import type { Platform, Post, Template, Video } from "./types";

const normaliseTag = (t: string) => t.trim().replace(/^#+/, "").replace(/\s+/g, "");

/**
 * Builds the platform-specific version of a video by applying the channel template.
 * Phase 3 will replace the copy step with AI-generated title/description/hashtags.
 */
export function buildPostDraft(
  video: Video,
  platform: Platform,
  template: Template | undefined,
  extraHashtags: string[] = [],
): Pick<Post, "title" | "description" | "hashtags"> {
  const lim = PLATFORM_LIMITS[platform];
  const tags = Array.from(
    new Set([...extraHashtags, ...(template?.fixedHashtags ?? [])].map(normaliseTag).filter(Boolean)),
  ).slice(0, lim.maxHashtags);

  let title = video.title.trim();
  if (lim.titleMax !== null && title.length > lim.titleMax) title = title.slice(0, lim.titleMax - 1).trimEnd() + "…";

  const description = [video.description.trim(), template?.descriptionFooter?.trim()].filter(Boolean).join("\n\n");

  return { title, description, hashtags: tags };
}
