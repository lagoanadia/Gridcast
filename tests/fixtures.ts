import { newId } from "@/lib/store";
import type { Channel, Database, Platform, Post, QueueRule, Template, Video } from "@/lib/types";

/** Test fixture only: two channels with templates, queue rules and a few videos. The app itself never creates sample data. */
export function seedFixture(db: Database, userId: string, now = new Date(), withDemo = true, demoPosts = false) {
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
    descriptionFooter: platform === "youtube" ? `Suscríbete a ${channel.name} para ver más.` : "",
    youtubeCategoryId: platform === "youtube" ? "22" : undefined,
    language: "es", madeForKids: false, toneOfVoice: tone,
  });
  for (const p of ["youtube", "tiktok", "instagram"] as Platform[]) db.templates.push(tpl(bioniche, p, ["bioniche"], "Curioso, cercano, amante de la naturaleza"));
  for (const p of ["youtube", "tiktok"] as Platform[]) db.templates.push(tpl(pepito, p, ["pepitoalerta"], "Directo, alerta y un poco descarado"));

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
      channelId: channel.id, title, description: "Vídeo de ejemplo: sustitúyelo por tus propias subidas.",
      fileName: "demo.mp4", filePath: "demo://sample", fileSizeBytes: 18_000_000,
      durationSec: 30 + i * 7, width: 1080, height: 1920, status, formatTags: ["demo", ...tags],
    });
    db.videos.push(
      demo(pepito, "Alerta: el precio del pan", ["flat", "voiced", "news"], 1),
      demo(pepito, "Tres cosas que nadie te contó del metro", ["low-poly 3D", "voiced"], 2),
      demo(pepito, "La noche electoral en 45 segundos", ["flat", "silent", "political"], 3),
      demo(bioniche, "El pulpo que construye su casa", ["low-poly 3D", "voiced"], 4),
      demo(bioniche, "Por qué los flamencos son rosas", ["flat", "silent"], 5),
      demo(bioniche, "El perezoso más rápido (borrador)", ["flat"], 6, "draft"),
    );

    if (demoPosts) {
      // One piece of content per card state on the Today screen: scheduled, published and failed.
      const mkPost = (video: Video, platform: Platform, status: Post["status"], hoursFromNow: number, extra: Partial<Post> = {}): Post => ({
        id: newId(), userId, createdAt: at, videoId: video.id, channelId: video.channelId, platform,
        title: video.title, description: video.description, hashtags: [video.channelId === bioniche.id ? "bioniche" : "pepitoalerta"],
        scheduledAt: new Date(now.getTime() + hoursFromNow * 3_600_000).toISOString(), status, attempts: 0, dryRun: true, ...extra,
      });
      const [bread, metro, , octopus, flamingos] = db.videos.slice(-6);
      db.posts.push(
        mkPost(octopus, "instagram", "scheduled", 26),
        mkPost(octopus, "tiktok", "scheduled", 26),
        mkPost(flamingos, "instagram", "published", -30, { publishedAt: new Date(now.getTime() - 30 * 3_600_000).toISOString(), externalId: "demo-1", externalUrl: "https://example.com/demo-1" }),
        mkPost(bread, "youtube", "failed", -2, { attempts: 3, error: "No se pudo conectar con la cuenta de YouTube." }),
        mkPost(metro, "tiktok", "proposed", 52),
      );
      octopus.status = "scheduled"; flamingos.status = "published"; metro.status = "ready";
    }
  }
  return true;
}
