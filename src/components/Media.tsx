import { PrintScene } from "@/components/PrintScene";
import type { Video } from "@/lib/types";

const isReal = (v: Video) => !!v.filePath && !v.filePath.startsWith("demo://");

/** Thumbnail for a stored file: <img> for photos, a paused <video> for videos, a placeholder drawing for demo rows. */
export function MediaThumb({ video }: { video: Video }) {
  if (!isReal(video)) return <PrintScene seed={video.id} />;
  return video.mediaType === "image"
    // eslint-disable-next-line @next/next/no-img-element
    ? <img src={`/api/media/${video.id}`} alt="" loading="lazy" />
    : <video src={`/api/media/${video.id}#t=0.5`} preload="metadata" muted />;
}

/** Full-size player on the detail page. */
export function MediaPlayer({ video, emptyLabel }: { video: Video; emptyLabel: string }) {
  if (!isReal(video)) return <div className="player-ph" title={emptyLabel}><PrintScene seed={video.id} /></div>;
  return video.mediaType === "image"
    // eslint-disable-next-line @next/next/no-img-element
    ? <img className="player" style={{ objectFit: "contain", background: "var(--accent-soft)" }} src={`/api/media/${video.id}`} alt={video.title} />
    : <video className="player" src={`/api/media/${video.id}`} controls preload="metadata" />;
}
