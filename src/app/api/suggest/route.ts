import { NextResponse } from "next/server";
import { suggestCaptions } from "@/lib/ai";
import { getData } from "@/lib/data";
import { PLATFORMS, type Platform } from "@/lib/types";

/** "Sugerir con IA" in the Crear wizard. Never returns provider details or the key. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { channelId?: string; platform?: string; title?: string; idea?: string } | null;
  const { db } = getData();
  const channel = db.channels.find((c) => c.id === body?.channelId);
  const platform = PLATFORMS.includes(body?.platform as Platform) ? (body!.platform as Platform) : "instagram";
  if (!channel) return NextResponse.json({ ok: false, reason: "not_found" }, { status: 400 });

  const tpl = db.templates.find((t) => t.channelId === channel.id && t.platform === platform);
  const result = await suggestCaptions({
    title: String(body?.title ?? "").slice(0, 200),
    idea: String(body?.idea ?? "").slice(0, 1500),
    platform, channelName: channel.name, tone: tpl?.toneOfVoice, fixedHashtags: tpl?.fixedHashtags,
  });
  return NextResponse.json(result, { status: result.ok ? 200 : result.reason === "not_configured" ? 503 : 502 });
}
