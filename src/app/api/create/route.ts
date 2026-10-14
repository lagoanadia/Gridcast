import { unlinkSync } from "node:fs";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { createContent, type WhenMode } from "@/lib/create";
import { mediaUrlFor } from "@/lib/media";
import { mediaStorageEnabled, objectExists, publicUrlFor, removeObject } from "@/lib/media-storage";
import { availability, getPublisher } from "@/lib/publisher";
import { runDuePublishes } from "@/lib/services";
import { currentUserId, loadDb, mutate, newId } from "@/lib/store";
import { PLATFORMS, type MediaType, type Platform, type Video } from "@/lib/types";
import { mediaTypeOf, parseMeta, storeUpload, videoFromCloudUpload } from "@/lib/uploads";

const MODES: WhenMode[] = ["now", "at", "next", "draft"];
const csv = (v: FormDataEntryValue | null) => String(v ?? "").split(",").map((x) => x.trim().replace(/^#/, "")).filter(Boolean);
const fail = (reason: string) => NextResponse.json({ ok: false, reason }, { status: 400 });

/**
 * Final step of the "Crear" wizard: creates the content and its drafts or approved posts in one go.
 * The file arrives either as an upload (local mode) or as a path the browser already sent to cloud storage.
 */
export async function POST(req: Request) {
  const form = await req.formData();
  const userId = currentUserId();
  const channelId = String(form.get("channelId") ?? "");
  const mode = String(form.get("mode") ?? "") as WhenMode;
  if (!MODES.includes(mode)) return fail("no_time");
  const channel = (await loadDb()).channels.find((c) => c.id === channelId && c.userId === userId);
  if (!channel) return fail("not_found");
  const wanted = csv(form.get("platforms")).filter((p): p is Platform => PLATFORMS.includes(p as Platform));
  // Never accept a network that would only fail (or pretend to publish) later.
  if (mode !== "draft" && wanted.some((p) => !availability(p, channel.accounts.find((a) => a.platform === p)).ok)) return fail("platform_unavailable");

  let video: Video;
  let discard: () => Promise<void> | void;
  const uploadedPath = String(form.get("uploadedPath") ?? "");
  if (uploadedPath) {
    // The path must be one /api/upload/sign handed to this user.
    if (!mediaStorageEnabled() || !uploadedPath.startsWith(`${userId}/`) || uploadedPath.includes("..")) return fail("no_file");
    if (!(await objectExists(uploadedPath))) return fail("upload_missing");
    const fileName = String(form.get("fileName") ?? uploadedPath);
    const type = String(form.get("mediaType") ?? "");
    const mediaType: MediaType = type === "video" ? "video" : "image";
    video = videoFromCloudUpload({
      id: newId(), userId, channelId, path: uploadedPath, publicUrl: publicUrlFor(uploadedPath), fileName,
      size: Number(form.get("fileSize")) || 0, mediaType, meta: parseMeta(form.get("meta")),
    });
    discard = () => removeObject(uploadedPath);
  } else {
    const file = form.get("file");
    const mediaType = file instanceof File ? mediaTypeOf(file) : null;
    if (!(file instanceof File) || !mediaType) return fail("no_file");
    video = await storeUpload(file, mediaType, userId, channelId, parseMeta(form.get("meta")));
    discard = () => { try { unlinkSync(video.filePath!); } catch { /* already gone */ } };
  }

  const result = await mutate((db) => {
    db.videos.push(video);
    const res = createContent(db, userId, {
      videoId: video.id,
      title: String(form.get("title") ?? ""),
      description: String(form.get("description") ?? ""),
      hashtags: csv(form.get("hashtags")),
      platforms: wanted,
      mode,
      whenLocal: String(form.get("whenLocal") ?? ""),
    }, new Date());
    if (!res.ok) db.videos = db.videos.filter((v) => v.id !== video.id);
    return res;
  });

  if (!result.ok) {
    await discard();
    return NextResponse.json(result, { status: 400 });
  }

  if (mode === "now") {
    await mutate((db) => runDuePublishes(db, getPublisher(), new Date(), mediaUrlFor));
  }
  for (const p of ["/", "/calendar", "/library"]) revalidatePath(p);
  return NextResponse.json({ ...result, mode });
}
