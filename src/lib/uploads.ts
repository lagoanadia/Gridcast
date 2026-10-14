import "server-only";
import { createWriteStream, mkdirSync } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { probeVideo } from "./probe";
import { newId, nowIso, UPLOAD_DIR } from "./store";
import { STORAGE_PREFIX } from "./media-storage";
import type { MediaType, Video } from "./types";

type Meta = { durationSec?: number; width?: number; height?: number };

export const mediaTypeOf = (file: File): MediaType | null =>
  file.type.startsWith("video/") ? "video" : file.type.startsWith("image/") ? "image" : null;

export function parseMeta(raw: unknown): Meta {
  try {
    const o = JSON.parse(String(raw ?? "{}"));
    return Object.fromEntries(Object.entries(o).filter(([, v]) => typeof v === "number" && v > 0)) as Meta;
  } catch {
    return {};
  }
}

/** Writes the file under the user's upload folder and returns the (unsaved) Video row. */
export async function storeUpload(file: File, mediaType: MediaType, userId: string, channelId: string, meta: Meta): Promise<Video> {
  const id = newId();
  const ext = path.extname(file.name).toLowerCase().replace(/[^.a-z0-9]/g, "") || (mediaType === "image" ? ".jpg" : ".mp4");
  const dir = path.join(UPLOAD_DIR, userId);
  mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, `${id}${ext}`);
  await pipeline(Readable.fromWeb(file.stream() as never), createWriteStream(filePath));

  if (!meta.width || !meta.height || (mediaType === "video" && !meta.durationSec)) meta = { ...(await probeVideo(filePath)), ...meta };

  return {
    id, userId, createdAt: nowIso(), channelId, mediaType,
    title: file.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim(),
    description: "", fileName: file.name, filePath, fileSizeBytes: file.size,
    durationSec: mediaType === "video" ? meta.durationSec : undefined,
    width: meta.width, height: meta.height,
    status: "draft", formatTags: [],
  };
}

/** Video row for a file the browser already uploaded to cloud storage. */
export function videoFromCloudUpload(a: {
  id: string; userId: string; channelId: string; path: string; publicUrl: string; fileName: string; size: number; mediaType: MediaType; meta: Meta;
}): Video {
  return {
    id: a.id, userId: a.userId, createdAt: nowIso(), channelId: a.channelId, mediaType: a.mediaType,
    title: a.fileName.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim(),
    description: "", fileName: a.fileName, filePath: `${STORAGE_PREFIX}${a.path}`, mediaUrl: a.publicUrl,
    fileSizeBytes: a.size > 0 ? a.size : undefined,
    durationSec: a.mediaType === "video" ? a.meta.durationSec : undefined,
    width: a.meta.width, height: a.meta.height,
    status: "draft", formatTags: [],
  };
}
