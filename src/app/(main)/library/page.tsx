import Link from "next/link";
import { setVideoStatusAction } from "@/app/actions";
import { fmtDuration, PlatformPill, VideoStatusPill } from "@/components/Pills";
import { MediaThumb } from "@/components/Media";
import { Uploader } from "@/components/Uploader";
import { getData } from "@/lib/data";
import { DATE_LOCALE, t } from "@/lib/i18n";
import { mediaStorageEnabled } from "@/lib/media-storage";
import { PLATFORMS, VIDEO_STATUSES } from "@/lib/types";

// Without cloud storage, files go through a Vercel function, which rejects bodies over ~4.5 MB.
const MAX_MB = process.env.VERCEL ? 4 : undefined;

type SP = Promise<{ channel?: string; status?: string; format?: string; platform?: string }>;

export default async function Library({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const { db } = await getData();
  const formats = Array.from(new Set(db.videos.flatMap((v) => v.formatTags))).sort();

  const videos = db.videos
    .filter((v) => !sp.channel || v.channelId === sp.channel)
    .filter((v) => !sp.status || v.status === sp.status)
    .filter((v) => !sp.format || v.formatTags.includes(sp.format))
    .filter((v) => !sp.platform || db.posts.some((p) => p.videoId === v.id && p.platform === sp.platform && p.status !== "cancelled"))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const qs = new URLSearchParams(Object.entries(sp).filter(([, v]) => v) as [string, string][]).toString();

  return (
    <>
      <div className="page-head"><h1>{t("library.title")}</h1></div>

      {mediaStorageEnabled() ? (
        <Link href="/create" className="btn primary">{t("today.newPost")}</Link>
      ) : (
              <Uploader
          channels={db.channels.map((c) => ({ id: c.id, name: c.name }))}
          labels={{ hint: t("library.uploadHint"), pick: t("library.pickFiles"), uploading: t("library.uploading"), uploaded: t("library.uploaded"), channel: t("library.channel"), failed: t("library.uploadFailed"), tooLarge: t("library.tooLarge", { mb: MAX_MB ?? 0 }) }}
          maxMb={MAX_MB}
        />
      )}

      <form className="filters section" method="get">
        <label className="field">{t("library.channel")}
          <select name="channel" defaultValue={sp.channel ?? ""}>
            <option value="">{t("common.all")}</option>
            {db.channels.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label className="field">{t("library.status")}
          <select name="status" defaultValue={sp.status ?? ""}>
            <option value="">{t("common.all")}</option>
            {VIDEO_STATUSES.map((s) => <option key={s} value={s}>{t(`videoStatus.${s}`)}</option>)}
          </select>
        </label>
        <label className="field">{t("library.format")}
          <select name="format" defaultValue={sp.format ?? ""}>
            <option value="">{t("common.all")}</option>
            {formats.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
        </label>
        <label className="field">{t("library.platform")}
          <select name="platform" defaultValue={sp.platform ?? ""}>
            <option value="">{t("common.all")}</option>
            {PLATFORMS.map((p) => <option key={p} value={p}>{t(`platform.${p}`)}</option>)}
          </select>
        </label>
        <button className="btn">{t("common.apply")}</button>
      </form>

      <div className="grid grid-3 section" style={{ gap: 18 }}>
        {videos.length === 0 && <div className="empty" style={{ gridColumn: "1/-1" }}>{t("library.empty")}</div>}
        {videos.map((v) => {
          const channel = db.channels.find((c) => c.id === v.channelId);
          const platforms = Array.from(new Set(db.posts.filter((p) => p.videoId === v.id && p.status !== "cancelled").map((p) => p.platform)));
          return (
            <article key={v.id} className="stamp">
              <Link href={`/videos/${v.id}`} className="thumb" aria-label={v.title}>
                <span className="denom">{v.mediaType === "image" ? t("create.content.photo") : fmtDuration(v.durationSec)}</span>
                <span className="dur"><span className="dot" style={{ background: channel?.color }} /></span>
                <span className="window">
                  <MediaThumb video={v} />
                </span>
              </Link>
              <div className="body">
                <div className="row small" style={{ gap: 6 }}>
                  <span className="data muted">{channel?.name}</span>
                  <VideoStatusPill s={v.status} />
                </div>
                <Link href={`/videos/${v.id}`} className="title">{v.title}</Link>
                {v.formatTags.length > 0 && <div className="row" style={{ gap: 4 }}>{v.formatTags.map((f) => <span key={f} className="pill tag">{f}</span>)}</div>}
                {platforms.length > 0 && <div className="row" style={{ gap: 4 }}>{platforms.map((p) => <PlatformPill key={p} p={p} />)}</div>}
                {v.expiresAt && <span className="small data" style={{ color: "var(--rust)" }}>{t("library.expires", { date: new Date(v.expiresAt).toLocaleDateString(DATE_LOCALE) })}</span>}
                {(v.status === "draft" || v.status === "ready") && (
                  <form action={setVideoStatusAction} style={{ marginTop: "auto" }}>
                    <input type="hidden" name="videoId" value={v.id} />
                    <input type="hidden" name="status" value={v.status === "draft" ? "ready" : "draft"} />
                    <input type="hidden" name="return" value={`/library${qs ? `?${qs}` : ""}`} />
                    <button className={`btn sm ${v.status === "draft" ? "primary" : "ghost"}`}>
                      {v.status === "draft" ? t("library.markReady") : t("library.backToDraft")}
                    </button>
                  </form>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}
