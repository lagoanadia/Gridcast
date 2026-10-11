import { createReadStream, statSync } from "node:fs";
import { Readable } from "node:stream";
import { currentUserId, loadDb } from "@/lib/store";

/** Streams a video file with HTTP range support (needed for seeking in <video>). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const video = loadDb().videos.find((v) => v.id === id && v.userId === currentUserId());
  if (!video?.filePath || video.filePath.startsWith("demo://")) return new Response("Not found", { status: 404 });

  let size: number;
  try { size = statSync(video.filePath).size; } catch { return new Response("Not found", { status: 404 }); }
  const type = video.fileName?.toLowerCase().endsWith(".mov") ? "video/quicktime" : "video/mp4";
  const range = req.headers.get("range")?.match(/bytes=(\d*)-(\d*)/);

  if (range) {
    const start = range[1] ? Number(range[1]) : 0;
    const end = range[2] ? Math.min(Number(range[2]), size - 1) : Math.min(start + 4 * 1024 * 1024, size - 1);
    if (start >= size) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    const stream = Readable.toWeb(createReadStream(video.filePath, { start, end })) as ReadableStream;
    return new Response(stream, {
      status: 206,
      headers: { "Content-Type": type, "Content-Length": String(end - start + 1), "Content-Range": `bytes ${start}-${end}/${size}`, "Accept-Ranges": "bytes" },
    });
  }
  const stream = Readable.toWeb(createReadStream(video.filePath)) as ReadableStream;
  return new Response(stream, { headers: { "Content-Type": type, "Content-Length": String(size), "Accept-Ranges": "bytes" } });
}
