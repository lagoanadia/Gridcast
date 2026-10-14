import { PrintScene } from "@/components/PrintScene";
import type { Video } from "@/lib/types";

const isReal = (v: Video) => !!v.filePath && !v.filePath.startsWith("demo://");
const srcOf = (v: Video) => v.mediaUrl ?? `/api/media/${v.id}`;

/** Thumbnail for a stored file: <img> for photos, a paused <video> for videos, a placeholder drawing for demo rows. */
export function MediaThumb({ video }: { video: Video }) {
  if (!isReal(video)) return <PrintScene seed={video.id} />;
  return video.mediaType === "image"
    // eslint-disable-next-line @next/next/no-img-element
    ? <img src={srcOf(video)} alt="" loading="lazy" />
    : <video src={`${srcOf(video)}#t=0.5`} preload="metadata" muted />;
}

/** Full-size player on the detail page. */
export function MediaPlayer({ video, emptyLabel }: { video: Video; emptyLabel: string }) {
  if (!isReal(video)) return <div className="player-ph" title={emptyLabel}><PrintScene seed={video.id} /></div>;
  return video.mediaType === "image"
    // eslint-disable-next-line @next/next/no-img-element
    ? <img className="player" style={{ objectFit: "contain", background: "var(--accent-soft)" }} src={srcOf(video)} alt={video.title} />
    : <video className="player" src={srcOf(video)} controls preload="metadata" />;
}
