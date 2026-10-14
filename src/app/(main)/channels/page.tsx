import { addChannelAction, connectInstagramAction, disconnectAccountAction, updateChannelAction, upsertTemplateAction } from "@/app/actions";
import { Flash } from "@/components/Flash";
import { currentUser } from "@/lib/current-user";
import { PlatformPill } from "@/components/Pills";
import { TimezoneField } from "@/components/TimezoneField";
import { getData } from "@/lib/data";
import { t } from "@/lib/i18n";
import { PLATFORMS } from "@/lib/types";

export default async function ChannelsPage({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string }> }) {
  const sp = await searchParams;
  const { db } = await getData();
  const user = await currentUser();
  return (
    <>
      <div className="page-head"><h1>{t("channels.title")}</h1></div>
      <Flash sp={sp} />
      {user && (
        <div className="card spread" style={{ marginBottom: 20 }}>
          <span className="small muted">{t("auth.signedInAs")} <strong style={{ color: "var(--ink)" }}>{user.email}</strong></span>
          <form action="/api/auth/logout" method="post"><button className="btn sm">{t("auth.signOut")}</button></form>
        </div>
      )}
      <div className="stack" style={{ gap: 30 }}>
        {db.channels.map((c) => (
          <section key={c.id} className="stack">
            <form action={updateChannelAction} className="card stack">
              <input type="hidden" name="channelId" value={c.id} />
              <div className="spread">
                <h2 className="row"><span className="dot" style={{ background: c.color, width: 16, height: 16 }} />{c.name}</h2>
                <div className="row small">
                  {c.accounts.map((a) => (
                    <span key={a.platform} className="row" style={{ gap: 4 }}>
                      <PlatformPill p={a.platform} />
                      <span className="muted">{a.connected ? a.handle : t("channels.notConnected")}</span>
                    </span>
                  ))}
                </div>
              </div>
              <div className="form-grid">
                <label className="field">{t("channels.name")}<input type="text" name="name" defaultValue={c.name} /></label>
                <label className="field">{t("channels.timezone")}<input type="text" name="timezone" defaultValue={c.timezone} /></label>
                <label className="field">{t("channels.threshold")}<input type="number" name="lowQueueThresholdDays" min={0} defaultValue={c.lowQueueThresholdDays} /></label>
                <label className="field">Color<input type="text" name="color" defaultValue={c.color} /></label>
              </div>
              <label className="check"><input type="checkbox" name="autopilot" defaultChecked={c.autopilot} />{t("channels.autopilot")} <span className="muted small" style={{ fontWeight: 400 }}>— {t("channels.autopilotHint")}</span></label>
              <div><button className="btn primary">{t("common.save")}</button></div>
            </form>

            <div className="card stack">
              <h3>{t("channels.connections")}</h3>
              {(["instagram", "tiktok", "youtube"] as const).map((p) => {
                const a = c.accounts.find((x) => x.platform === p);
                return (
                  <div key={p} className="spread" style={{ alignItems: "flex-start", gap: 14 }}>
                    <div className="row"><PlatformPill p={p} /><span className="muted small">{a?.connected ? `${t("channels.connected")}: ${a.handle}` : t("channels.notConnected")}</span></div>
                    {p === "instagram" && (
                      a?.connected ? (
                        <form action={disconnectAccountAction}>
                          <input type="hidden" name="channelId" value={c.id} /><input type="hidden" name="platform" value="instagram" />
                          <button className="btn sm danger">{t("channels.disconnect")}</button>
                        </form>
                      ) : (
                        <form action={connectInstagramAction} className="row" style={{ flex: 1, justifyContent: "flex-end" }}>
                          <input type="hidden" name="channelId" value={c.id} />
                          <input type="text" name="token" autoComplete="off" data-1p-ignore data-lpignore="true" style={{ WebkitTextSecurity: "disc", maxWidth: 360 } as React.CSSProperties} placeholder={t("channels.instagramToken")} aria-label={t("channels.instagramToken")} />
                          <button className="btn sm primary">{t("channels.connectShort")}</button>
                        </form>
                      )
                    )}
                    {p === "youtube" && <a className="btn sm" href={`/api/oauth/google/start?channelId=${c.id}`}>{a?.connected ? t("channels.reconnect") : t("channels.connect")}</a>}
                    {p === "tiktok" && <span className="small muted">{t("channels.soon")}</span>}
                  </div>
                );
              })}
              <p className="small muted" style={{ margin: 0 }}>{t("channels.connectionsHint")}</p>
            </div>

            <h3>{t("channels.templates")}</h3>
            <div className="grid grid-3">
              {PLATFORMS.filter((p) => c.accounts.some((a) => a.platform === p)).map((p) => {
                const tpl = db.templates.find((x) => x.channelId === c.id && x.platform === p);
                return (
                  <form key={p} action={upsertTemplateAction} className="card stack">
                    <input type="hidden" name="channelId" value={c.id} />
                    <input type="hidden" name="platform" value={p} />
                    <PlatformPill p={p} />
                    <label className="field">{t("channels.fixedHashtags")}<input type="text" name="fixedHashtags" defaultValue={tpl?.fixedHashtags.map((h) => `#${h}`).join(" ")} /></label>
                    <label className="field">{t("channels.footer")}<textarea name="descriptionFooter" defaultValue={tpl?.descriptionFooter} style={{ minHeight: 60 }} /></label>
                    <label className="field">{t("channels.tone")}<input type="text" name="toneOfVoice" defaultValue={tpl?.toneOfVoice} /></label>
                    <div className="form-grid">
                      <label className="field">{t("channels.language")}<input type="text" name="language" defaultValue={tpl?.language ?? "es"} /></label>
                      {p === "youtube" && <label className="field">{t("channels.category")}<input type="text" name="youtubeCategoryId" defaultValue={tpl?.youtubeCategoryId} /></label>}
                    </div>
                    {p === "youtube" && (
                      <>
                        <label className="field">{t("channels.playlist")}<input type="text" name="playlistId" defaultValue={tpl?.playlistId} /></label>
                        <label className="check"><input type="checkbox" name="madeForKids" defaultChecked={tpl?.madeForKids ?? false} />{t("channels.madeForKids")}</label>
                      </>
                    )}
                    <div><button className="btn sm">{t("common.save")}</button></div>
                  </form>
                );
              })}
            </div>
          </section>
        ))}
        <form action={addChannelAction} className="card flat row">
          <TimezoneField />
          <input type="text" name="name" placeholder={t("channels.name")} style={{ maxWidth: 260 }} required />
          <button className="btn">{t("channels.addChannel")}</button>
        </form>
      </div>
    </>
  );
}
