import Link from "next/link";
import { approveAction, approveAllAction, fillQueueAction, runDueAction, unscheduleAction } from "@/app/actions";
import { Flash } from "@/components/Flash";
import { fmtDateTime, PlatformPill } from "@/components/Pills";
import { Ridge } from "@/components/Ridge";
import { getData, isDryRun } from "@/lib/data";
import { t } from "@/lib/i18n";
import { hasErrors, validatePost } from "@/lib/platforms";
import { queueDaysLeft } from "@/lib/scheduler";
import { addDaysYmd, zonedParts } from "@/lib/time";
import type { Channel, Post } from "@/lib/types";

type SP = Promise<{ msg?: string; err?: string }>;
const RIDGE_DAYS = 14;

/** Distinct videos per local day for the next RIDGE_DAYS days, split by approval state. */
function ridgeDays(channel: Channel, posts: Post[], now: Date) {
  const today = zonedParts(now, channel.timezone);
  const keys = Array.from({ length: RIDGE_DAYS }, (_, i) => {
    const d = addDaysYmd(today.y, today.m, today.d, i);
    return `${d.y}-${d.m}-${d.d}`;
  });
  const days = keys.map(() => ({ approved: new Set<string>(), proposed: new Set<string>() }));
  for (const p of posts) {
    if (p.channelId !== channel.id || !p.scheduledAt || !["proposed", "scheduled", "publishing", "published"].includes(p.status)) continue;
    const z = zonedParts(new Date(p.scheduledAt), channel.timezone);
    const i = keys.indexOf(`${z.y}-${z.m}-${z.d}`);
    if (i === -1) continue;
    (p.status === "proposed" ? days[i].proposed : days[i].approved).add(p.videoId);
  }
  return days.map((d) => ({ approved: d.approved.size, proposed: [...d.proposed].filter((v) => !d.approved.has(v)).length }));
}

export default async function Dashboard({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const { db } = getData();
  const now = new Date();
  const tz = db.channels[0]?.timezone ?? "UTC";
  const pending = db.posts
    .filter((p) => p.status === "proposed")
    .sort((a, b) => (a.scheduledAt ?? "").localeCompare(b.scheduledAt ?? ""));

  return (
    <>
      <div className="page-head">
        <div>
          <span className="kicker">{new Intl.DateTimeFormat("en-GB", { timeZone: tz, weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(now)}</span>
          <h1>{t("dashboard.title")}</h1>
        </div>
        <div className="stack" style={{ alignItems: "flex-end" }}>
          {isDryRun() && <div className="dry-banner">{t("common.dryRunBanner")}</div>}
          <div className="row">
            <form action={fillQueueAction}><button className="btn primary">{t("dashboard.fillQueue")}</button></form>
            <form action={runDueAction}><button className="btn">{t("dashboard.runDue")}</button></form>
          </div>
        </div>
      </div>
      <Flash sp={sp} />

      <div className="grid grid-2">
        {db.channels.map((c, idx) => {
          const days = queueDaysLeft(c, db.queueRules, db.videos, db.posts, now);
          const low = days !== null && days < c.lowQueueThresholdDays;
          const next = db.posts
            .filter((p) => p.channelId === c.id && (p.status === "scheduled" || p.status === "proposed") && p.scheduledAt && new Date(p.scheduledAt) > now)
            .sort((a, b) => a.scheduledAt!.localeCompare(b.scheduledAt!))[0];
          const ready = db.videos.filter((v) => v.channelId === c.id && v.status === "ready").length;
          const queued = new Set(db.posts.filter((p) => p.channelId === c.id && (p.status === "scheduled" || p.status === "proposed")).map((p) => p.videoId)).size;
          return (
            <section key={c.id} className="card poster channel-card">
              <div className="spread">
                <span className="ch-label">{t("dashboard.channelNo", { n: String(idx + 1).padStart(2, "0") })}</span>
                {c.autopilot && <span className="pill on">{t("dashboard.autopilotOn")}</span>}
              </div>
              <h2 style={{ marginTop: 4 }}>{c.name}</h2>
              <div className="hero">
                <span className={`sun ${low ? "low" : ""}`} aria-hidden="true" />
                <span className="big-number">{days ?? "–"}</span>
                <span className="unit">{days === null ? t("dashboard.noRules") : t("dashboard.daysLeft")}</span>
                {low && (
                  <span className="stamp-mark" style={{ marginLeft: "auto", alignSelf: "center" }} title={t("dashboard.lowQueueDetail", { n: c.lowQueueThresholdDays })}>
                    {t("dashboard.lowQueue")}
                  </span>
                )}
              </div>
              <div className="meta-line">
                {ready} {t("dashboard.ready")} · {queued} {t("dashboard.queued")}
              </div>
              <div className="meta-line" style={{ marginTop: 4 }}>
                {t("dashboard.nextPost")}: {next ? <><strong>{fmtDateTime(next.scheduledAt, c.timezone)}</strong> — {next.title}</> : <span className="muted">{t("dashboard.nothingNext")}</span>}
              </div>
              <Ridge days={ridgeDays(c, db.posts, now)} />
              <div className="ridge-legend"><span>{t("dashboard.ridge", { n: RIDGE_DAYS })}</span><span>{t("dashboard.ridgeEnd", { n: RIDGE_DAYS })}</span></div>
            </section>
          );
        })}
      </div>

      <section className="section">
        <div className="spread section-title">
          <h2>{t("dashboard.pending")} {pending.length > 0 && <span className="data" style={{ fontSize: 18, color: "var(--rust)" }}>×{pending.length}</span>}</h2>
          {pending.length > 0 && <form action={approveAllAction}><button className="btn ink">{t("dashboard.approveAll")}</button></form>}
        </div>
        {pending.length === 0 ? (
          <div className="empty">{t("dashboard.noPending")}</div>
        ) : (
          <div className="list">
            {pending.map((p) => {
              const video = db.videos.find((v) => v.id === p.videoId)!;
              const channel = db.channels.find((c) => c.id === p.channelId)!;
              const invalid = hasErrors(validatePost(p, video));
              return (
                <div key={p.id} className="spread">
                  <div className="row">
                    <span className="data small" style={{ minWidth: 150 }}>{fmtDateTime(p.scheduledAt, channel.timezone)}</span>
                    <span className="dot" style={{ background: channel.color }} title={channel.name} />
                    <PlatformPill p={p.platform} />
                    <Link href={`/videos/${video.id}`} style={{ fontWeight: 700 }}>{p.title}</Link>
                    {invalid && <span className="pill failed">{t("dashboard.needsFixes")}</span>}
                  </div>
                  <div className="row">
                    <form action={approveAction}>
                      <input type="hidden" name="postId" value={p.id} />
                      <button className="btn sm primary" disabled={invalid}>{t("common.approve")}</button>
                    </form>
                    <form action={unscheduleAction}>
                      <input type="hidden" name="postId" value={p.id} />
                      <button className="btn sm ghost">{t("common.unschedule")}</button>
                    </form>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}
