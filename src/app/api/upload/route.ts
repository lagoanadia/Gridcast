import { createWriteStream, mkdirSync } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { NextResponse } from "next/server";
import { probeVideo } from "@/lib/probe";
import { currentUserId, mutate, newId, nowIso, UPLOAD_DIR } from "@/lib/store";

/**
 * Phase 1: stores the file on local disk.
 * Phase 1b: the browser uploads straight to Supabase Storage with a signed URL instead.
 */
export async function POST(req: Request) {
  const form = await req.formData();
  const file = form.get("file");
  const channelId = String(form.get("channelId") ?? "");
  if (!(file instanceof File) || !file.type.startsWith("video/")) return NextResponse.json({ error: "video file required" }, { status: 400 });

  let meta: { durationSec?: number; width?: number; height?: number } = {};
  try { meta = JSON.parse(String(form.get("meta") ?? "{}")); } catch { /* ignore */ }

  const userId = currentUserId();
  const id = newId();
  const ext = path.extname(file.name).toLowerCase().replace(/[^.a-z0-9]/g, "") || ".mp4";
  const dir = path.join(UPLOAD_DIR, userId);
  mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, `${id}${ext}`);
  await pipeline(Readable.fromWeb(file.stream() as never), createWriteStream(filePath));

  if (!meta.durationSec || !meta.width || !meta.height) meta = { ...(await probeVideo(filePath)), ...stripEmpty(meta) };

  const ok = mutate((db) => {
    if (!db.channels.some((c) => c.id === channelId && c.userId === userId)) return false;
    db.videos.push({
      id, userId, createdAt: nowIso(), channelId,
      title: file.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim(),
      description: "", fileName: file.name, filePath, fileSizeBytes: file.size,
      durationSec: typeof meta.durationSec === "number" ? meta.durationSec : undefined,
      width: typeof meta.width === "number" ? meta.width : undefined,
      height: typeof meta.height === "number" ? meta.height : undefined,
      status: "draft", formatTags: [],
    });
    return true;
  });
  if (!ok) return NextResponse.json({ error: "unknown channel" }, { status: 400 });
  return NextResponse.json({ id });
}

const stripEmpty = <T extends object>(o: T) => Object.fromEntries(Object.entries(o).filter(([, v]) => typeof v === "number" && v > 0)) as Partial<T>;
