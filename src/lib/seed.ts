import { newId } from "./store";
import type { Channel, Database, Platform, QueueRule, Template, Video } from "./types";

/** Creates the owner's two channels, templates and queue rules, plus a few demo videos. */
export function seedDb(db: Database, userId: string, now = new Date(), withDemo = true) {
  if (db.channels.some((c) => c.userId === userId)) return false;
  const at = now.toISOString();
  const tz = "Europe/Madrid"; // TODO(owner): confirm each channel's time zone

  const mkChannel = (name: string, slug: string, color: string, platforms: Platform[]): Channel => ({
    id: newId(), userId, createdAt: at, name, slug, color, timezone: tz, autopilot: false, lowQueueThresholdDays: 5,
    accounts: platforms.map((platform) => ({ platform, handle: `@${slug}`, connected: false })),
  });
  const bioniche = mkChannel("Bioniche", "bioniche", "#C4502A", ["youtube", "tiktok", "instagram"]);
  const pepito = mkChannel("Pepito Alerta", "pepitoalerta", "#E3A231", ["youtube", "tiktok"]);
  db.channels.push(bioniche, pepito);

  const tpl = (channel: Channel, platform: Platform, tags: string[], tone: string): Template => ({
    id: newId(), userId, createdAt: at, channelId: channel.id, platform,
    fixedHashtags: platform === "youtube" ? [...tags, "shorts"] : tags,
    descriptionFooter: platform === "youtube" ? `Subscribe to ${channel.name} for more.` : "",
    youtubeCategoryId: platform === "youtube" ? "22" : undefined,
    language: "es", madeForKids: false, toneOfVoice: tone,
  });
  for (const p of ["youtube", "tiktok", "instagram"] as Platform[]) db.templates.push(tpl(bioniche, p, ["bioniche"], "Curious, warm, nature-loving"));
  for (const p of ["youtube", "tiktok"] as Platform[]) db.templates.push(tpl(pepito, p, ["pepitoalerta"], "Punchy, alert, a bit cheeky"));

  const rule = (channel: Channel, times: string[], days: number[], platforms: Platform[]): QueueRule => ({
    id: newId(), userId, createdAt: at, channelId: channel.id, times, daysOfWeek: days, platforms, active: true,
  });
  db.queueRules.push(
    rule(pepito, ["18:00"], [0, 1, 2, 3, 4, 5, 6], ["youtube", "tiktok"]),
    rule(bioniche, ["19:00"], [1, 3, 5], ["youtube", "tiktok", "instagram"]),
  );

  if (withDemo) {
    const demo = (channel: Channel, title: string, tags: string[], i: number, status: Video["status"] = "ready"): Video => ({
      id: newId(), userId, createdAt: new Date(now.getTime() - (20 - i) * 60_000).toISOString(),
      channelId: channel.id, title, description: "Demo video — replace with your own uploads.",
      fileName: "demo.mp4", filePath: "demo://sample", fileSizeBytes: 18_000_000,
      durationSec: 30 + i * 7, width: 1080, height: 1920, status, formatTags: ["demo", ...tags],
    });
    db.videos.push(
      demo(pepito, "Alerta: the price of bread", ["flat", "voiced", "news"], 1),
      demo(pepito, "Three things nobody told you about the metro", ["low-poly 3D", "voiced"], 2),
      demo(pepito, "Election night in 45 seconds", ["flat", "silent", "political"], 3),
      demo(bioniche, "The octopus that builds a house", ["low-poly 3D", "voiced"], 4),
      demo(bioniche, "Why flamingos are pink", ["flat", "silent"], 5),
      demo(bioniche, "Sloth speed-run (draft)", ["flat"], 6, "draft"),
    );
  }
  return true;
}
