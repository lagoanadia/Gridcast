"use server";

import { unlinkSync } from "node:fs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { hasErrors, validatePost } from "@/lib/platforms";
import { getPublisher } from "@/lib/publisher";
import { approvePost, checkLowQueue, fillQueue, movePost, retryFailedPosts, runDuePublishes, syncVideoStatus, unschedulePost } from "@/lib/services";
import { encryptToken } from "@/lib/crypto";
import { mediaUrlFor } from "@/lib/media";
import { inspectToken } from "@/lib/publisher/instagram";
import { isStoragePath, removeObject, STORAGE_PREFIX } from "@/lib/media-storage";
import { currentUserId } from "@/lib/current-user";
import { mutate, newId, nowIso } from "@/lib/store";
import { buildPostDraft } from "@/lib/templates";
import { PLATFORMS, type Platform, type Post, type VideoStatus } from "@/lib/types";
import { t } from "@/lib/i18n";
import { zonedToUtc } from "@/lib/time";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const list = (s: string) => s.split(/[,\n]/).map((x) => x.trim()).filter(Boolean);
const back = (path: string, msg?: string, err = false) =>
  redirect(msg ? `${path}${path.includes("?") ? "&" : "?"}${err ? "err" : "msg"}=${encodeURIComponent(msg)}` : path);

function done(paths: string[]) {
  paths.forEach((p) => revalidatePath(p));
}

/* ── Queue & publishing ─────────────────────── */

export async function fillQueueAction() {
  const uid = await currentUserId();
  const n = await mutate((db) => {
    const created = fillQueue(db, uid, new Date());
    checkLowQueue(db, uid, new Date());
    return created;
  });
  done(["/", "/calendar"]);
  back("/", t("today.filled", { n }));
}

export async function runDueAction() {
  const uid = await currentUserId();
  const res = await mutate(async (db) => {
    const r = await runDuePublishes(db, getPublisher(), new Date(), mediaUrlFor);
    checkLowQueue(db, uid, new Date());
    return r;
  });
  done(["/", "/calendar", "/notifications"]);
  back("/", t("today.ran", { ok: res.filter((r) => r.ok).length, failed: res.filter((r) => !r.ok).length }));
}

/** "Reintentar" on a failed card: re-queue its failed posts and publish them right away. */
export async function retryVideoAction(f: FormData) {
  const uid = await currentUserId();
  const videoId = str(f, "videoId");
  await mutate(async (db) => {
    const n = retryFailedPosts(db, uid, videoId, new Date());
    if (n) await runDuePublishes(db, getPublisher(), new Date(), mediaUrlFor);
  });
  done(["/", "/calendar", "/notifications"]);
  back("/", t("today.retried"));
}

export async function approveAction(f: FormData) {
  const uid = await currentUserId();
  const res = await mutate((db) => approvePost(db, uid, str(f, "postId")));
  done(["/", "/calendar"]);
  const ret = str(f, "return") || "/";
  back(ret, res.ok ? undefined : `Could not approve: ${res.reason}`, !res.ok);
}

export async function approveAllAction() {
  const uid = await currentUserId();
  const n = await mutate((db) => {
    return db.posts.filter((p) => p.userId === uid && p.status === "proposed").reduce((acc, p) => acc + (approvePost(db, uid, p.id).ok ? 1 : 0), 0);
  });
  done(["/", "/calendar"]);
  back("/", t("today.approvedN", { n }));
}

export async function unscheduleAction(f: FormData) {
  const uid = await currentUserId();
  await mutate((db) => unschedulePost(db, uid, str(f, "postId")));
  done(["/", "/calendar"]);
  back(str(f, "return") || "/");
}

/** Called from the calendar drag-and-drop (client). */
export async function movePostAction(postId: string, scheduledAt: string) {
  const uid = await currentUserId();
  const ok = await mutate((db) => movePost(db, uid, postId, new Date(scheduledAt).toISOString()));
  done(["/", "/calendar"]);
  return ok;
}

/* ── Videos ─────────────────────────────────── */

export async function setVideoStatusAction(f: FormData) {
  const uid = await currentUserId();
  const id = str(f, "videoId");
  const status = str(f, "status") as VideoStatus;
  await mutate((db) => {
    const v = db.videos.find((x) => x.id === id && x.userId === uid);
    if (!v || !["draft", "ready"].includes(status)) return;
    v.status = status;
    if (status === "draft") {
      db.posts.filter((p) => p.videoId === id && (p.status === "proposed" || p.status === "scheduled")).forEach((p) => (p.status = "cancelled"));
    }
  });
  done(["/library", `/videos/${id}`]);
  back(str(f, "return") || "/library");
}

export async function updateVideoAction(f: FormData) {
  const uid = await currentUserId();
  const id = str(f, "videoId");
  await mutate((db) => {
    const v = db.videos.find((x) => x.id === id && x.userId === uid);
    if (!v) return;
    v.title = str(f, "title");
    v.description = str(f, "description");
    v.formatTags = list(str(f, "formatTags"));
    const exp = str(f, "expiresAt");
    v.expiresAt = exp ? new Date(`${exp}T23:59:59`).toISOString() : undefined;
    const ch = str(f, "channelId");
    if (ch && db.channels.some((c) => c.id === ch && c.userId === v.userId)) v.channelId = ch;
  });
  done(["/library", `/videos/${id}`]);
  back(`/videos/${id}`, "Saved.");
}

export async function deleteVideoAction(f: FormData) {
  const uid = await currentUserId();
  const id = str(f, "videoId");
  await mutate((db) => {
    const v = db.videos.find((x) => x.id === id && x.userId === uid);
    if (!v) return;
    if (v.filePath && isStoragePath(v.filePath)) {
      removeObject(v.filePath.slice(STORAGE_PREFIX.length)).catch(() => undefined);
    } else if (v.filePath && !v.filePath.startsWith("demo://")) {
      try { unlinkSync(v.filePath); } catch { /* already gone */ }
    }
    db.videos = db.videos.filter((x) => x.id !== id);
    db.posts = db.posts.filter((p) => p.videoId !== id || p.status === "published");
  });
  done(["/library", "/calendar", "/"]);
  back("/library");
}

/** Manually create a platform version (outside the queue). */
export async function createPostAction(f: FormData) {
  const uid = await currentUserId();
  const id = str(f, "videoId");
  const platform = str(f, "platform") as Platform;
  await mutate((db) => {
    const v = db.videos.find((x) => x.id === id && x.userId === uid);
    if (!v || !PLATFORMS.includes(platform)) return;
    const tpl = db.templates.find((x) => x.userId === uid && x.channelId === v.channelId && x.platform === platform);
    db.posts.push({
      id: newId(), userId: uid, createdAt: nowIso(), videoId: v.id, channelId: v.channelId, platform,
      ...buildPostDraft(v, platform, tpl), status: "proposed", attempts: 0,
    });
  });
  done([`/videos/${id}`]);
  back(`/videos/${id}`);
}

export async function updatePostAction(f: FormData) {
  const uid = await currentUserId();
  const postId = str(f, "postId");
  let videoId = "";
  let invalid = false;
  await mutate((db) => {
    const p = db.posts.find((x) => x.id === postId && x.userId === uid);
    if (!p || !["proposed", "scheduled", "failed"].includes(p.status)) return;
    videoId = p.videoId;
    const channel = db.channels.find((c) => c.id === p.channelId)!;
    p.title = str(f, "title");
    p.description = str(f, "description");
    p.hashtags = list(str(f, "hashtags").replace(/#/g, " ").replace(/\s+/g, ",")).map((h) => h.replace(/^#/, ""));
    const when = str(f, "scheduledAt"); // wall time in the channel's zone
    if (when) {
      const [d, tm] = when.split("T");
      const [y, m, day] = d.split("-").map(Number);
      const [hh, mm] = tm.split(":").map(Number);
      p.scheduledAt = zonedToUtc(y, m, day, hh, mm, channel.timezone).toISOString();
    } else p.scheduledAt = undefined;
    // Any edit to an approved post requires re-approval unless autopilot is on.
    if (p.status === "scheduled" && !channel.autopilot) p.status = "proposed";
    if (p.status === "failed") { p.status = "proposed"; p.attempts = 0; p.error = undefined; p.nextAttemptAt = undefined; }
    const video = db.videos.find((v) => v.id === p.videoId)!;
    invalid = hasErrors(validatePost(p as Post, video));
    if (p.status === "scheduled" && invalid) p.status = "proposed";
    syncVideoStatus(db, p.videoId);
  });
  done([`/videos/${videoId}`, "/calendar", "/"]);
  back(`/videos/${videoId}`, invalid ? "Saved, but this version has validation errors." : "Saved.", invalid);
}

/* ── Channels, templates, rules ─────────────── */

export async function updateChannelAction(f: FormData) {
  const uid = await currentUserId();
  const id = str(f, "channelId");
  await mutate((db) => {
    const c = db.channels.find((x) => x.id === id && x.userId === uid);
    if (!c) return;
    c.name = str(f, "name") || c.name;
    const tz = str(f, "timezone");
    try { new Intl.DateTimeFormat("en", { timeZone: tz }); c.timezone = tz; } catch { /* keep old */ }
    c.autopilot = f.get("autopilot") === "on";
    c.lowQueueThresholdDays = Math.max(0, Number(str(f, "lowQueueThresholdDays")) || 0);
    c.color = str(f, "color") || c.color;
  });
  done(["/channels", "/"]);
  back("/channels", "Saved.");
}

export async function addChannelAction(f: FormData) {
  const name = str(f, "name").slice(0, 60);
  if (!name) back("/channels");
  const uid = await currentUserId();
  let timezone = "Europe/Madrid";
  const asked = str(f, "timezone");
  try { new Intl.DateTimeFormat("en", { timeZone: asked }); if (asked) timezone = asked; } catch { /* keep the default */ }
  await mutate((db) => {
    db.channels.push({
      id: newId(), userId: uid, createdAt: nowIso(), name, slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "") || "cuenta",
      color: "#6c47ff", timezone, autopilot: false, lowQueueThresholdDays: 5,
      accounts: PLATFORMS.map((platform) => ({ platform, handle: "", connected: false })),
    });
  });
  done(["/channels", "/", "/create"]);
  back("/channels");
}

export async function upsertTemplateAction(f: FormData) {
  const uid = await currentUserId();
  const channelId = str(f, "channelId");
  const platform = str(f, "platform") as Platform;
  await mutate((db) => {
    if (!db.channels.some((c) => c.id === channelId && c.userId === uid) || !PLATFORMS.includes(platform)) return;
    let tpl = db.templates.find((x) => x.userId === uid && x.channelId === channelId && x.platform === platform);
    if (!tpl) {
      tpl = { id: newId(), userId: uid, createdAt: nowIso(), channelId, platform, fixedHashtags: [], descriptionFooter: "", language: "es", madeForKids: false, toneOfVoice: "" };
      db.templates.push(tpl);
    }
    tpl.fixedHashtags = list(str(f, "fixedHashtags").replace(/#/g, " ").replace(/\s+/g, ","));
    tpl.descriptionFooter = str(f, "descriptionFooter");
    tpl.youtubeCategoryId = str(f, "youtubeCategoryId") || undefined;
    tpl.language = str(f, "language") || "es";
    tpl.madeForKids = f.get("madeForKids") === "on";
    tpl.playlistId = str(f, "playlistId") || undefined;
    tpl.toneOfVoice = str(f, "toneOfVoice");
  });
  done(["/channels"]);
  back("/channels", "Template saved.");
}

export async function upsertRuleAction(f: FormData) {
  const uid = await currentUserId();
  const ruleId = str(f, "ruleId");
  const times = list(str(f, "times")).filter((x) => /^([01]\d|2[0-3]):[0-5]\d$/.test(x));
  const days = f.getAll("days").map(Number).filter((d) => d >= 0 && d <= 6);
  const platforms = f.getAll("platforms").map(String).filter((p): p is Platform => PLATFORMS.includes(p as Platform));
  if (!times.length || !days.length || !platforms.length) back("/queue", "A rule needs at least one valid time, day and platform.", true);
  await mutate((db) => {
    const channelId = str(f, "channelId");
    if (!db.channels.some((c) => c.id === channelId && c.userId === uid)) return;
    const existing = db.queueRules.find((r) => r.id === ruleId && r.userId === uid);
    const values = { channelId, times, daysOfWeek: days, platforms, active: f.get("active") === "on" };
    if (existing) Object.assign(existing, values);
    else db.queueRules.push({ id: newId(), userId: uid, createdAt: nowIso(), ...values });
  });
  done(["/queue", "/"]);
  back("/queue", "Rule saved.");
}

export async function deleteRuleAction(f: FormData) {
  const uid = await currentUserId();
  const ruleId = str(f, "ruleId");
  await mutate((db) => { db.queueRules = db.queueRules.filter((r) => !(r.id === ruleId && r.userId === uid)); });
  done(["/queue", "/"]);
  back("/queue");
}

export async function markAllReadAction() {
  const uid = await currentUserId();
  await mutate((db) => db.notifications.filter((n) => n.userId === uid).forEach((n) => (n.read = true)));
  done(["/notifications"]);
  back("/notifications");
}

/* ── Connections ────────────────────────────── */

/** Saves an Instagram access token (encrypted) after checking with Instagram that it works. */
export async function connectInstagramAction(f: FormData) {
  const uid = await currentUserId();
  const channelId = str(f, "channelId");
  const token = str(f, "token").replace(/\s+/g, "");
  if (!token) return back("/channels", "Pega el token de Instagram.", true);
  const who = await inspectToken(token).catch(() => null);
  if (!who) return back("/channels", "No he podido contactar con Instagram. Inténtalo de nuevo.", true);
  if (!who.ok) return back("/channels", who.error, true);
  let encrypted: string;
  try { encrypted = encryptToken(token); } catch { return back("/channels", "Falta TOKEN_ENCRYPTION_KEY en el servidor, así que no puedo guardar el token de forma segura.", true); }

  const saved = await mutate((db) => {
    const channel = db.channels.find((c) => c.id === channelId && c.userId === uid);
    if (!channel) return false;
    const data = { handle: who.username ? `@${who.username}` : "Instagram", tokenEncrypted: encrypted, externalUserId: who.userId, tokenIssuedAt: nowIso(), connected: true };
    const acc = channel.accounts.find((a) => a.platform === "instagram");
    if (acc) Object.assign(acc, data);
    else channel.accounts.push({ platform: "instagram", ...data });
    return true;
  });
  done(["/channels", "/create"]);
  back("/channels", saved ? `Instagram conectado: ${who.username ? `@${who.username}` : "cuenta"}.` : "No se ha encontrado la cuenta.", !saved);
}

export async function disconnectAccountAction(f: FormData) {
  const uid = await currentUserId();
  const channelId = str(f, "channelId");
  const platform = str(f, "platform") as Platform;
  await mutate((db) => {
    const acc = db.channels.find((c) => c.id === channelId && c.userId === uid)?.accounts.find((a) => a.platform === platform);
    if (acc) Object.assign(acc, { connected: false, tokenEncrypted: undefined, externalUserId: undefined, tokenIssuedAt: undefined });
  });
  done(["/channels", "/create"]);
  back("/channels", "Cuenta desconectada.");
}
