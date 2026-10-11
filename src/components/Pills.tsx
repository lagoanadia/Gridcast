import { t } from "@/lib/i18n";
import type { Platform, PostStatus, VideoStatus } from "@/lib/types";

export const VideoStatusPill = ({ s }: { s: VideoStatus }) => <span className={`pill ${s}`}>{t(`videoStatus.${s}`)}</span>;
export const PostStatusPill = ({ s }: { s: PostStatus }) => <span className={`pill ${s}`}>{t(`postStatus.${s}`)}</span>;
export const PlatformPill = ({ p }: { p: Platform }) => <span className={`pill ${p}`}>{t(`platform.${p}`)}</span>;

export function fmtDuration(sec?: number) {
  if (sec === undefined) return "–";
  const s = Math.round(sec);
  return s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}` : `${s}s`;
}

export function fmtDateTime(iso: string | undefined, tz: string) {
  if (!iso) return "–";
  return new Intl.DateTimeFormat("en-GB", { timeZone: tz, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}
