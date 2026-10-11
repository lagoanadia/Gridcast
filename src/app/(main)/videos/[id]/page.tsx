import Link from "next/link";
import { notFound } from "next/navigation";
import { approveAction, createPostAction, deleteVideoAction, setVideoStatusAction, unscheduleAction, updatePostAction, updateVideoAction } from "@/app/actions";
import { ConfirmButton } from "@/components/ConfirmButton";
import { Flash } from "@/components/Flash";
import { fmtDuration, PlatformPill, PostStatusPill, VideoStatusPill } from "@/components/Pills";
import { PostEditor } from "@/components/PostEditor";
import { PrintScene } from "@/components/PrintScene";
import { getData } from "@/lib/data";
import { t } from "@/lib/i18n";
import { hasErrors, PLATFORM_LIMITS, validatePost } from "@/lib/platforms";
import { zonedParts } from "@/lib/time";
import { PLATFORMS } from "@/lib/types";

const pad = (n: number) => String(n).padStart(2, "0");

export default async function VideoPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ msg?: string; err?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const { db } = getData();
  const video = db.videos.find((v) => v.id === id);
  if (!video) notFound();
  const channel = db.channels.find((c) => c.id === video.channelId)!;
  const posts = db.posts.filter((p) => p.videoId === id && p.status !== "cancelled").sort((a, b) => a.platform.localeCompare(b.platform));
  const missing = PLATFORMS.filter((p) => !posts.some((x) => x.platform === p) && channel.accounts.some((a) => a.platform === p));
  const real = video.filePath && !video.filePath.startsWith("demo://");

  const local = (iso?: string) => {
    if (!iso) return "";
    const z = zonedParts(new Date(iso), channel.timezone);
    return `${z.y}-${pad(z.m)}-${pad(z.d)}T${pad(z.hh)}:${pad(z.mm)}`;
  };

  return (
    <>
      <div className="page-head">
        <div>
          <Link href="/library" className="kicker">← {t("nav.library")}</Link>
          <h1>{video.title}</h1>
          <div className="row small" style={{ marginTop: 8 }}>
            <span className="dot" style={{ background: channel.color }} /> <span className="data">{channel.name}</span>
            <VideoStatusPill s={video.status} />
            <span className="pill tag">{fmtDuration(video.durationSec)}</span>
            {video.width && <span className="pill tag">{t("video.dimensions", { w: video.width, h: video.height ?? 0 })}</span>}
            {video.fileSizeBytes && <span className="pill tag">{(video.fileSizeBytes / 1024 / 1024).toFixed(1)} MB</span>}
          </div>
        </div>
        {(video.status === "draft" || video.status === "ready") && (
          <form action={setVideoStatusAction}>
            <input type="hidden" name="videoId" value={video.id} />
            <input type="hidden" name="status" value={video.status === "draft" ? "ready" : "draft"} />
            <input type="hidden" name="return" value={`/videos/${video.id}`} />
            <button className={`btn ${video.status === "draft" ? "primary" : ""}`}>{video.status === "draft" ? t("library.markReady") : t("library.backToDraft")}</button>
          </form>
        )}
      </div>
      <Flash sp={sp} />

      <div className="detail">
        <div className="stack">
          {real ? <video className="player" src={`/api/media/${video.id}`} controls preload="metadata" /> : <div className="player-ph" title={t("video.noFile")}><PrintScene seed={video.id} /></div>}
          <div className="card flat small">
            <h3>{t("video.transcript")}</h3>
            <p className="muted" style={{ marginBottom: 0 }}>{video.transcript ?? t("video.transcriptSoon")}</p>
          </div>
        </div>

        <div className="stack">
          <form action={updateVideoAction} className="card stack">
            <h2>{t("video.details")}</h2>
            <input type="hidden" name="videoId" value={video.id} />
            <div className="form-grid">
              <label className="field">{t("video.title")}<input type="text" name="title" defaultValue={video.title} required /></label>
              <label className="field">{t("library.channel")}
                <select name="channelId" defaultValue={video.channelId}>{db.channels.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
              </label>
            </div>
            <label className="field">{t("video.description")}<textarea name="description" defaultValue={video.description} /></label>
            <div className="form-grid">
              <label className="field">{t("video.formatTags")}<input type="text" name="formatTags" defaultValue={video.formatTags.join(", ")} /><span className="hint">{t("video.formatTagsHint")}</span></label>
              <label className="field">{t("video.expiresAt")}<input type="date" name="expiresAt" defaultValue={video.expiresAt ? local(video.expiresAt).slice(0, 10) : ""} /></label>
            </div>
            <div className="spread">
              <button className="btn primary">{t("common.save")}</button>
            </div>
          </form>

          <h2 style={{ marginTop: 10 }}>{t("video.versions")}</h2>
          {posts.length === 0 && <p className="muted" style={{ margin: 0 }}>{t("video.noVersions")}</p>}
          {missing.length > 0 && (
            <div className="row">
              {missing.map((p) => (
                <form key={p} action={createPostAction}>
                  <input type="hidden" name="videoId" value={video.id} />
                  <input type="hidden" name="platform" value={p} />
                  <button className="btn sm">+ {t("video.createVersion", { platform: t(`platform.${p}`) })}</button>
                </form>
              ))}
            </div>
          )}
          {posts.map((p) => {
            const issues = validatePost(p, video);
            const lim = PLATFORM_LIMITS[p.platform];
            const editable = ["proposed", "scheduled", "failed"].includes(p.status);
            return (
              <section key={p.id} className="card stack">
                <div className="spread">
                  <div className="row"><PlatformPill p={p.platform} /><PostStatusPill s={p.status} />{p.dryRun && <span className="pill tag">dry run</span>}</div>
                  <div className="row">
                    {p.status === "proposed" && (
                      <form action={approveAction}>
                        <input type="hidden" name="postId" value={p.id} />
                        <input type="hidden" name="return" value={`/videos/${video.id}`} />
                        <button className="btn sm primary" disabled={hasErrors(issues) || !p.scheduledAt}>{t("common.approve")}</button>
                      </form>
                    )}
                    {editable && (
                      <form action={unscheduleAction}>
                        <input type="hidden" name="postId" value={p.id} />
                        <input type="hidden" name="return" value={`/videos/${video.id}`} />
                        <button className="btn sm ghost">{t("common.unschedule")}</button>
                      </form>
                    )}
                  </div>
                </div>
                {issues.length > 0 && (
                  <ul className="issues">{issues.map((i, k) => <li key={k} className={i.severity}>{t(i.messageKey, i.params)}</li>)}</ul>
                )}
                {p.error && <ul className="issues"><li className="error">{p.error}</li></ul>}
                {p.externalUrl && <a className="small" href={p.externalUrl} target="_blank" rel="noreferrer">{p.externalUrl}</a>}
                <PostEditor
                  post={p}
                  scheduledLocal={local(p.scheduledAt)}
                  titleMax={lim.titleMax}
                  captionMax={lim.descriptionMax}
                  maxHashtags={lim.maxHashtags}
                  editable={editable}
                  labels={{ title: t("video.title"), description: t("video.description"), hashtags: t("video.hashtags"), scheduledAt: `${t("video.scheduledAt")} (${channel.timezone})`, save: t("common.save") }}
                  action={updatePostAction}
                />
              </section>
            );
          })}

          <form action={deleteVideoAction} style={{ marginTop: 16 }}>
            <input type="hidden" name="videoId" value={video.id} />
            <ConfirmButton className="btn sm danger" message={t("video.deleteConfirm")}>{t("common.delete")}</ConfirmButton>
          </form>
        </div>
      </div>
    </>
  );
}
