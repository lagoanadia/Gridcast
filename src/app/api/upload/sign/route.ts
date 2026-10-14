import { NextResponse } from "next/server";
import { createSignedUpload, MEDIA_BUCKET, mediaStorageEnabled, objectPath, supabaseConfig } from "@/lib/media-storage";
import { currentUserId } from "@/lib/current-user";
import { newId } from "@/lib/store";

/** Step 1 of a cloud upload: hand the browser a signed token to send the file straight to storage. */
export async function POST(req: Request) {
  const cfg = supabaseConfig();
  if (!mediaStorageEnabled() || !cfg) return NextResponse.json({ ok: false, reason: "no_storage" }, { status: 503 });
  if (!cfg.anonKey) return NextResponse.json({ ok: false, reason: "no_anon_key" }, { status: 503 });

  const body = (await req.json().catch(() => null)) as { fileName?: string; contentType?: string } | null;
  const type = String(body?.contentType ?? "");
  if (!body?.fileName || !(type.startsWith("image/") || type.startsWith("video/"))) return NextResponse.json({ ok: false, reason: "no_file" }, { status: 400 });

  const id = newId();
  const path = objectPath(await currentUserId(), id, body.fileName);
  try {
    const signed = await createSignedUpload(path);
    return NextResponse.json({ ok: true, id, bucket: MEDIA_BUCKET, url: cfg.url, anonKey: cfg.anonKey, ...signed });
  } catch {
    return NextResponse.json({ ok: false, reason: "storage_error" }, { status: 502 });
  }
}
