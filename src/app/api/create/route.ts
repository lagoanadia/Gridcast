import { unlinkSync } from "node:fs";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { createContent, type WhenMode } from "@/lib/create";
import { getPublisher } from "@/lib/publisher";
import { runDuePublishes } from "@/lib/services";
import { currentUserId, loadDb, mutate, saveDb } from "@/lib/store";
import { mediaTypeOf, parseMeta, storeUpload } from "@/lib/uploads";
import { PLATFORMS, type Platform } from "@/lib/types";

const MODES: WhenMode[] = ["now", "at", "next", "draft"];
const csv = (v: FormDataEntryValue | null) => String(v ?? "").split(",").map((x) => x.trim().replace(/^#/, "")).filter(Boolean);

/** Final step of the "Crear" wizard: stores the file and creates its drafts or approved posts in one go. */
export async function POST(req: Request) {
  const form = await req.formData();
  const file = form.get("file");
  const mediaType = file instanceof File ? mediaTypeOf(file) : null;
  if (!(file instanceof File) || !mediaType) return NextResponse.json({ ok: false, reason: "no_file" }, { status: 400 });

  const userId = currentUserId();
  const channelId = String(form.get("channelId") ?? "");
  const mode = String(form.get("mode") ?? "") as WhenMode;
  if (!MODES.includes(mode)) return NextResponse.json({ ok: false, reason: "no_time" }, { status: 400 });
  if (!loadDb().channels.some((c) => c.id === channelId && c.userId === userId)) return NextResponse.json({ ok: false, reason: "not_found" }, { status: 400 });

  const video = await storeUpload(file, mediaType, userId, channelId, parseMeta(form.get("meta")));
  const result = mutate((db) => {
    db.videos.push(video);
    const res = createContent(db, userId, {
      videoId: video.id,
      title: String(form.get("title") ?? ""),
      description: String(form.get("description") ?? ""),
      hashtags: csv(form.get("hashtags")),
      platforms: csv(form.get("platforms")).filter((p): p is Platform => PLATFORMS.includes(p as Platform)),
      mode,
      whenLocal: String(form.get("whenLocal") ?? ""),
    }, new Date());
    if (!res.ok) db.videos = db.videos.filter((v) => v.id !== video.id);
    return res;
  });

  if (!result.ok) {
    try { unlinkSync(video.filePath!); } catch { /* already gone */ }
    return NextResponse.json(result, { status: 400 });
  }

  if (mode === "now") {
    const db = loadDb();
    await runDuePublishes(db, getPublisher(), new Date(), (v) => v.filePath ?? "");
    saveDb(db);
  }
  for (const p of ["/", "/calendar", "/library"]) revalidatePath(p);
  return NextResponse.json({ ...result, mode });
}
