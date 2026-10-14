import { NextResponse } from "next/server";
import { currentUserId } from "@/lib/current-user";
import { mutate } from "@/lib/store";
import { mediaTypeOf, parseMeta, storeUpload } from "@/lib/uploads";

/**
 * Phase 1: stores the file on local disk.
 * Phase 1b: the browser uploads straight to Supabase Storage with a signed URL instead.
 */
export async function POST(req: Request) {
  const form = await req.formData();
  const file = form.get("file");
  const channelId = String(form.get("channelId") ?? "");
  const mediaType = file instanceof File ? mediaTypeOf(file) : null;
  if (!(file instanceof File) || !mediaType) return NextResponse.json({ error: "video or image file required" }, { status: 400 });

  const userId = await currentUserId();
  const video = await storeUpload(file, mediaType, userId, channelId, parseMeta(form.get("meta")));
  const ok = await mutate((db) => {
    if (!db.channels.some((c) => c.id === channelId && c.userId === userId)) return false;
    db.videos.push(video);
    return true;
  });
  if (!ok) return NextResponse.json({ error: "unknown channel" }, { status: 400 });
  return NextResponse.json({ id: video.id });
}
