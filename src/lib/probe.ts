import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

/**
 * Server-side fallback for duration/dimensions when the browser couldn't read them
 * (e.g. a codec the browser can't decode). Uses ffprobe if installed; otherwise returns {}.
 */
export async function probeVideo(filePath: string): Promise<{ durationSec?: number; width?: number; height?: number }> {
  try {
    const { stdout } = await run("ffprobe", [
      "-v", "error", "-select_streams", "v:0",
      "-show_entries", "stream=width,height:stream_side_data=rotation:format=duration",
      "-of", "json", filePath,
    ], { timeout: 15_000 });
    const j = JSON.parse(stdout);
    const s = j.streams?.[0] ?? {};
    const rotation = Math.abs(Number(s.side_data_list?.find((d: { rotation?: number }) => d.rotation !== undefined)?.rotation ?? 0));
    const rotated = rotation === 90 || rotation === 270; // phone videos often store landscape pixels + rotation
    const duration = Number(j.format?.duration);
    return {
      durationSec: Number.isFinite(duration) ? duration : undefined,
      width: rotated ? s.height : s.width,
      height: rotated ? s.width : s.height,
    };
  } catch {
    return {};
  }
}
