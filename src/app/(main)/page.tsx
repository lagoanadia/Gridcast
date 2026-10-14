import Link from "next/link";
import { approveAllAction, fillQueueAction, retryVideoAction, runDueAction } from "@/app/actions";
import { Flash } from "@/components/Flash";
import { Welcome } from "@/components/Welcome";
import { currentUser } from "@/lib/current-user";
import { fmtDateTime } from "@/components/Pills";
import { MediaThumb } from "@/components/Media";
import { getData, isDryRun } from "@/lib/data";
import { DATE_LOCALE, t } from "@/lib/i18n";
import { queueDaysLeft } from "@/lib/scheduler";
import type { Channel, Database, Platform, Post } from "@/lib/types";

type SP = Promise<{ msg?: string; err?: string }>;
type CardStatus = "draft" | "scheduled" | "published" | "error";

const MAX_CARDS = 12;
const NET_LABEL: Record<Platform, string> = { youtube: "YT", tiktok: "TT", instagram: "IG" };

/** One card per piece of content: its state is the "worst" state of its platform versions. */
function cardStatus(posts: Post[]): CardStatus {
  if (posts.some((p) => p.status === "failed")) return "error";
  if (posts.length > 0 && posts.every((p) => p.status === "published")) return "published";
  if (posts.some((p) => p.status === "scheduled" || p.status === "publishing" || p.status === "published")) return "scheduled";
  return "draft";
}

function buildCards(db: Database, now: Date) {
  const cards = db.videos.map((video) => {
    const posts = db.posts.filter((p) => p.videoId === video.id && p.status !== "cancelled");
    const status = cardStatus(posts);
    const times = posts.map((p) => p.scheduledAt).filter((x): x is string => !!x).sort();
    const upcoming = times.find((x) => new Date(x) > now);
    const when = status === "published" ? posts.map((p) => p.publishedAt ?? p.scheduledAt).filter(Boolean).sort().pop() : (upcoming ?? times[0]);
    return { video, posts, status, when, channel: db.channels.find((c) => c.id === video.channelId)! };
  });
  const rank = { error: 0, scheduled: 1, draft: 1, published: 2 } as const;
  return cards.sort((a, b) => rank[a.status] - rank[b.status] || (a.when ?? "9").localeCompare(b.when ?? "9") || b.video.createdAt.localeCompare(a.video.createdAt));
}

function nextPublication(db: Database, now: Date) {
  const post = db.posts
    .filter((p) => (p.status === "scheduled" || p.status === "proposed") && p.scheduledAt && new Date(p.scheduledAt) > now)
    .sort((a, b) => (a.status === b.status ? 0 : a.status === "scheduled" ? -1 : 1) || a.scheduledAt!.localeCompare(b.scheduledAt!))[0];
  if (!post) return null;
  const channel = db.channels.find((c) => c.id === post.channelId)!;
  const when = new Intl.DateTimeFormat(DATE_LOCALE, { timeZone: channel.timezone, weekday: "long", hour: "2-digit", minute: "2-digit" }).format(new Date(post.scheduledAt!));
  const handle = channel.accounts.find((a) => a.platform === post.platform)?.handle ?? `@${channel.slug}`;
  return t("today.nextPostIn", { when, handle });
}

const Icon = ({ d, size }: { d: React.ReactNode; size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">{d}</svg>
);

function ContentBar({ channel, days, showName }: { channel: Channel; days: number | null; showName: boolean }) {
  const low = days !== null && days < channel.lowQueueThresholdDays;
  const label = showName ? t("today.contentForChannel", { channel: channel.name }) : t("today.contentFor");
  return (
    <div className={`content-bar ${low ? "low" : ""}`} role={low ? "status" : undefined}>
      {days === null ? <span>{t("today.noRules")}</span> : (
        <>
          <span>{label}</span>
          <strong>{days === 1 ? t("today.oneDay") : t("today.days", { n: days })}</strong>
          {low && <span className="stamp-mark">{t("today.lowQueue")}</span>}
        </>
      )}
    </div>
  );
}

export default async function Today({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const { db } = await getData();
  if (db.channels.length === 0) return <Welcome name={(await currentUser())?.name.split(" ")[0]} />;
  const now = new Date();
  const cards = buildCards(db, now);
  const shown = cards.slice(0, MAX_CARDS);
  const next = nextPublication(db, now);
  const pending = db.posts.filter((p) => p.status === "proposed").length;

  return (
    <>
      <div className="today-head">
        <div>
          <h1>{t("today.title")}</h1>
          <p className="next-line">{next ? <>{t("today.nextPost")} <strong>{next}</strong></> : t("today.nextNone")}</p>
        </div>
        <div className="head-side">
          {isDryRun() && <div className="dry-banner">{t("common.dryRunBanner")}</div>}
        </div>
      </div>
      <Flash sp={sp} />

      {shown.length === 0 ? (
        <div className="empty">{t("today.empty")}</div>
      ) : (
        <div className="post-grid">
          {shown.map(({ video, posts, status, when, channel }) => (
            <div key={video.id} className={`post-card ${status === "error" ? "is-error" : ""}`}>
              <div className="post-thumb">
                <Link href={`/videos/${video.id}`} aria-label={video.title} style={{ display: "block", height: "100%" }}><MediaThumb video={video} /></Link>
                <span className={`pill status ${status}`}>{t(`today.status.${status}`)}</span>
                {status === "error" && (
                  <form action={retryVideoAction} className="retry-form">
                    <input type="hidden" name="videoId" value={video.id} />
                    <button className="retry"><Icon d={<><path d="M20 11a8 8 0 1 0-2.3 5.7" /><path d="M20 4v7h-7" /></>} />{t("today.retry")}</button>
                  </form>
                )}
              </div>
              <Link href={`/videos/${video.id}`} className="info" style={{ textDecoration: "none" }}>
                <span className="title">{video.title}</span>
                <span className="nets" aria-label={Array.from(new Set(posts.map((p) => t(`platform.${p.platform}`)))).join(", ")}>
                  {Array.from(new Set(posts.map((p) => p.platform))).map((p) => <span key={p} className={`net ${p}`} title={t(`platform.${p}`)}>{NET_LABEL[p]}</span>)}
                </span>
                <span className="when">{channel.name}{when ? ` · ${fmtDateTime(when, channel.timezone)}` : ""}</span>
              </Link>
            </div>
          ))}
        </div>
      )}

      <div className="add-wrap">
        <Link href="/create" className="add-btn" aria-label={t("today.newPost")}>
          <Icon d={<path d="M12 5v14M5 12h14" />} />
          <span>{t("today.newPost")}</span>
        </Link>
      </div>

      <div className="content-bars">
        {db.channels.map((c) => (
          <ContentBar key={c.id} channel={c} days={queueDaysLeft(c, db.queueRules, db.videos, db.posts, now)} showName={db.channels.length > 1} />
        ))}
      </div>

      <div className="quick-actions">
        <form action={fillQueueAction}><button className="btn sm">{t("today.fillQueue")}</button></form>
        {pending > 0 && <form action={approveAllAction}><button className="btn sm primary">{t("today.approveAll")} ({pending})</button></form>}
        <form action={runDueAction}><button className="btn sm">{t("today.runDue")}</button></form>
        {cards.length > MAX_CARDS && <Link href="/library" className="btn sm ghost">{t("today.viewAll")}</Link>}
      </div>
    </>
  );
}
