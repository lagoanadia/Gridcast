"use client";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { buildImagePrompt, PROMPT_FORMATS, PROMPT_STYLES, type PromptFormat, type PromptStyle } from "@/lib/imagePrompt";
import { t } from "@/lib/i18n";
import { composeCaption, hasErrors, PLATFORM_LIMITS, validatePost, type ValidationIssue } from "@/lib/platforms";
import { PLATFORMS, type MediaType, type Platform, type Post, type Video } from "@/lib/types";

export type WizardChannel = {
  id: string; name: string; timezone: string; slug: string;
  /** One entry per network: can it be used now, and if not, why. */
  networks: { platform: Platform; handle?: string; available: boolean; note?: "soon" | "connect" }[];
  fixedHashtags: string[];
};

type Mode = "now" | "at" | "next";
type Meta = { width?: number; height?: number; durationSec?: number };
const STEPS = 5;

/** Reads dimensions (and duration for videos) in the browser. */
function probe(file: File, type: MediaType): Promise<Meta> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const done = (m: Meta) => { URL.revokeObjectURL(url); resolve(m); };
    if (type === "image") {
      const img = new Image();
      img.onload = () => done({ width: img.naturalWidth || undefined, height: img.naturalHeight || undefined });
      img.onerror = () => done({});
      img.src = url;
    } else {
      const v = document.createElement("video");
      v.preload = "metadata";
      v.onloadedmetadata = () => done({ durationSec: isFinite(v.duration) ? v.duration : undefined, width: v.videoWidth || undefined, height: v.videoHeight || undefined });
      v.onerror = () => done({});
      v.src = url;
    }
  });
}

/** Instagram only accepts JPEG photos, so PNG, WebP and the like are converted here, before upload. */
async function toJpeg(file: File): Promise<File | null> {
  if (file.type === "image/jpeg") return file;
  try {
    const bmp = await createImageBitmap(file);
    const canvas = document.createElement("canvas");
    canvas.width = bmp.width;
    canvas.height = bmp.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#fff"; // transparent PNGs would turn black otherwise
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bmp, 0, 0);
    const blob: Blob | null = await new Promise((r) => canvas.toBlob(r, "image/jpeg", 0.92));
    return blob ? new File([blob], `${file.name.replace(/\.[^.]+$/, "")}.jpg`, { type: "image/jpeg" }) : null;
  } catch {
    return null;
  }
}

const NetName = ({ p }: { p: Platform }) => <>{t(`platform.${p}`)}</>;

export function CreateWizard({ channels, maxMb, cloud }: { channels: WizardChannel[]; maxMb?: number; cloud?: boolean }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState(0);
  const [channelId, setChannelId] = useState(channels[0]?.id ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [mediaType, setMediaType] = useState<MediaType>("image");
  const [meta, setMeta] = useState<Meta>({});
  const [preview, setPreview] = useState("");
  const [over, setOver] = useState(false);
  const [fileError, setFileError] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagDraft, setTagDraft] = useState("");
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [mode, setMode] = useState<Mode>("next");
  const [whenLocal, setWhenLocal] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string[]>([]);
  // image prompt helper
  const [idea, setIdea] = useState("");
  const [style, setStyle] = useState<PromptStyle>("realista");
  const [format, setFormat] = useState<PromptFormat>("vertical");
  const [copied, setCopied] = useState(false);
  // AI caption suggestions
  const [ai, setAi] = useState<{ description: string; hashtags: string[] }[]>([]);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState("");

  const channel = channels.find((c) => c.id === channelId);
  const prompt = useMemo(() => buildImagePrompt({ idea, style, format }), [idea, style, format]);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  // Changing account resets the networks (each account has its own) and offers its fixed hashtags.
  useEffect(() => {
    if (!channel) return;
    const offered = channel.networks.filter((n) => n.available).map((n) => n.platform).filter((p) => (mediaType === "image" ? p !== "youtube" : true));
    setPlatforms((offered.includes("instagram") ? ["instagram"] : offered.slice(0, 1)) as Platform[]);
    setTags(channel.fixedHashtags.slice(0, 3));
  }, [channelId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function pick(picked: File | undefined) {
    if (!picked) return;
    const type: MediaType | null = picked.type.startsWith("video/") ? "video" : picked.type.startsWith("image/") ? "image" : null;
    if (!type) return setFileError(t("create.content.unsupported"));
    let f = picked;
    if (type === "image") {
      const jpeg = await toJpeg(picked);
      if (!jpeg) return setFileError(t("create.content.badImage"));
      f = jpeg;
    }
    if (maxMb && f.size > maxMb * 1024 * 1024) return setFileError(t("create.content.tooLarge", { mb: maxMb }));
    setFileError("");
    setFile(f);
    setMediaType(type);
    setPreview(URL.createObjectURL(f));
    setMeta(await probe(f, type));
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim());
    // YouTube has no photos: drop it when the file is an image.
    setPlatforms((cur) => (type === "image" ? cur.filter((p) => p !== "youtube") : cur));
  }

  async function suggest() {
    setAiBusy(true);
    setAiError("");
    try {
      const res = await fetch("/api/suggest", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelId, platform: platforms[0] ?? "instagram", title, idea: description }),
      });
      const data = await res.json().catch(() => null);
      if (data?.ok) setAi(data.suggestions);
      else setAiError(t(`create.text.aiErr.${data?.reason ?? "provider_error"}`));
    } catch {
      setAiError(t("create.text.aiErr.provider_error"));
    }
    setAiBusy(false);
  }

  const addTag = () => {
    const tag = tagDraft.trim().replace(/^#+/, "").replace(/\s+/g, "");
    if (tag && !tags.includes(tag)) setTags([...tags, tag]);
    setTagDraft("");
  };
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  // Same checks the server runs, so problems show up before sending anything.
  const issues = useMemo(() => {
    if (!file) return {} as Record<Platform, ValidationIssue[]>;
    const video: Video = {
      id: "preview", userId: "", createdAt: "", channelId, mediaType, title: title.trim(), description: description.trim(), filePath: "x",
      fileSizeBytes: file.size, width: meta.width, height: meta.height, durationSec: meta.durationSec, status: "draft", formatTags: [],
    };
    return Object.fromEntries(platforms.map((platform) => {
      const post: Post = { id: "p", userId: "", createdAt: "", videoId: "preview", channelId, platform, title: title.trim(), description: description.trim(), hashtags: tags, status: "proposed", attempts: 0 };
      return [platform, validatePost(post, video)];
    })) as Record<Platform, ValidationIssue[]>;
  }, [file, meta, mediaType, title, description, tags, platforms, channelId]);
  const blocking = platforms.some((p) => hasErrors(issues[p] ?? []));

  const canNext = [
    !!file,
    title.trim().length > 0,
    platforms.length > 0 && !blocking,
    mode !== "at" || !!whenLocal,
    true,
  ][step];

  async function send(m: Mode | "draft") {
    if (!file) return;
    setSending(true);
    setError([]);
    const fd = new FormData();
    fd.set("channelId", channelId);
    fd.set("meta", JSON.stringify(meta));
    fd.set("title", title);
    fd.set("description", description);
    fd.set("hashtags", tags.join(","));
    fd.set("platforms", platforms.join(","));
    fd.set("mode", m);
    fd.set("whenLocal", whenLocal);
    if (cloud) {
      // Send the file straight to cloud storage, then tell the server where it is.
      try {
        const signRes = await fetch("/api/upload/sign", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fileName: file.name, contentType: file.type }) });
        const sign = await signRes.json().catch(() => null);
        if (!sign?.ok) { setError([t(`create.error.${sign?.reason ?? "storage_error"}`)]); setSending(false); return; }
        const { createClient } = await import("@supabase/supabase-js");
        const supabase = createClient(sign.url, sign.anonKey, { auth: { persistSession: false } });
        const up = await supabase.storage.from(sign.bucket).uploadToSignedUrl(sign.path, sign.token, file, { contentType: file.type });
        if (up.error) { setError([`${t("create.error.upload_failed")} ${up.error.message}`]); setSending(false); return; }
        fd.set("uploadedPath", sign.path);
        fd.set("fileName", file.name);
        fd.set("fileSize", String(file.size));
        fd.set("mediaType", mediaType);
      } catch {
        setError([t("create.error.upload_failed")]);
        setSending(false);
        return;
      }
    } else {
      fd.set("file", file);
    }
    try {
      const res = await fetch("/api/create", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({ ok: false, reason: "network" }));
      if (!res.ok || !data.ok) {
        const lines: string[] = data.issues?.length
          ? (data.issues as ValidationIssue[]).filter((i) => i.severity === "error").map((i) => t(i.messageKey, i.params))
          : [t(`create.error.${data.reason ?? "network"}`)];
        setError(lines);
        setSending(false);
        return;
      }
      const msg = m === "draft" ? t("create.done.draft") : m === "now" ? t("create.done.now") : t("create.done.scheduled", { n: data.posts });
      router.push(`/?msg=${encodeURIComponent(msg)}`);
      router.refresh();
    } catch {
      setError([t("create.error.network")]);
      setSending(false);
    }
  }

  const whenLabel = mode === "now" ? t("create.when.now") : mode === "next" ? t("create.when.next") : whenLocal.replace("T", " · ");

  return (
    <div className="wizard">
      <div className="wizard-progress" role="progressbar" aria-valuemin={1} aria-valuemax={STEPS} aria-valuenow={step + 1} aria-label={t("create.stepOf", { n: step + 1, total: STEPS })}>
        {Array.from({ length: STEPS }, (_, i) => (
          <button key={i} type="button" className={`wstep ${i === step ? "current" : i < step ? "done" : ""}`} disabled={i > step} onClick={() => setStep(i)}>
            <span className="n">{i < step ? "✓" : i + 1}</span>
            <span className="l">{t(`create.steps.${i}`)}</span>
          </button>
        ))}
      </div>

      <section className="card wizard-body">
        {step === 0 && (
          <div className="stack" style={{ gap: 18 }}>
            <h2>{t("create.content.title")}</h2>
            <div
              className={`dropzone ${over ? "over" : ""} ${file ? "filled" : ""}`}
              onDragOver={(e) => { e.preventDefault(); setOver(true); }}
              onDragLeave={() => setOver(false)}
              onDrop={(e) => { e.preventDefault(); setOver(false); pick(e.dataTransfer.files[0]); }}
            >
              {file && preview ? (
                <div className="file-preview">
                  {mediaType === "image" ? <img src={preview} alt="" /> : <video src={preview} muted playsInline controls />}
                  <div className="stack" style={{ gap: 6, alignItems: "flex-start", textAlign: "left" }}>
                    <strong>{file.name}</strong>
                    <span className="small muted">
                      {mediaType === "image" ? t("create.content.photo") : t("create.content.video")}
                      {meta.width && meta.height ? ` · ${t("create.content.details", { w: meta.width, h: meta.height })}` : ""}
                    </span>
                    <button type="button" className="btn sm" onClick={() => input.current?.click()}>{t("create.content.change")}</button>
                  </div>
                </div>
              ) : (
                <>
                  <p style={{ margin: "0 0 12px" }}>{t("create.content.hint")}</p>
                  <button type="button" className="btn primary" onClick={() => input.current?.click()}>{t("create.content.pick")}</button>
                </>
              )}
              <input ref={input} type="file" accept="image/*,video/*" hidden onChange={(e) => pick(e.target.files?.[0])} />
            </div>
            {fileError && <div className="flash error" role="alert">{fileError}</div>}

            <details className="help">
              <summary>{t("create.content.helpTitle")}</summary>
              <div className="stack" style={{ marginTop: 14 }}>
                <p className="muted small" style={{ margin: 0 }}>{t("create.content.helpIntro")}</p>
                <label className="field">{t("create.content.idea")}
                  <input type="text" value={idea} onChange={(e) => setIdea(e.target.value)} placeholder={t("create.content.ideaPlaceholder")} />
                </label>
                <div className="row" style={{ gap: 18, alignItems: "flex-start" }}>
                  <div className="stack" style={{ gap: 6 }}>
                    <span className="label">{t("create.content.style")}</span>
                    <div className="row" style={{ gap: 6 }}>
                      {(Object.keys(PROMPT_STYLES) as PromptStyle[]).map((k) => (
                        <button key={k} type="button" className={`choice ${style === k ? "on" : ""}`} aria-pressed={style === k} onClick={() => setStyle(k)}>{PROMPT_STYLES[k].label}</button>
                      ))}
                    </div>
                  </div>
                  <div className="stack" style={{ gap: 6 }}>
                    <span className="label">{t("create.content.format")}</span>
                    <div className="row" style={{ gap: 6 }}>
                      {(Object.keys(PROMPT_FORMATS) as PromptFormat[]).map((k) => (
                        <button key={k} type="button" className={`choice ${format === k ? "on" : ""}`} aria-pressed={format === k} onClick={() => setFormat(k)}>{PROMPT_FORMATS[k].label}</button>
                      ))}
                    </div>
                  </div>
                </div>
                {prompt && (
                  <div className="prompt-box">
                    <span className="label">{t("create.content.prompt")}</span>
                    <p>{prompt}</p>
                    <button type="button" className="btn sm primary" onClick={async () => { try { await navigator.clipboard.writeText(prompt); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* clipboard blocked */ } }}>
                      {copied ? t("create.content.copied") : t("create.content.copy")}
                    </button>
                  </div>
                )}
              </div>
            </details>
          </div>
        )}

        {step === 1 && (
          <div className="stack" style={{ gap: 16 }}>
            <h2>{t("create.text.title")}</h2>
            <label className="field">{t("create.text.name")}
              <span className="hint">{t("create.text.nameHint")}</span>
              <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} />
            </label>
            <label className="field">{t("create.text.description")}
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t("create.text.descriptionPlaceholder")} rows={5} />
            </label>
            <div className="stack" style={{ gap: 8 }}>
              <span className="label">{t("create.text.hashtags")}</span>
              <div className="row" style={{ gap: 6 }}>
                {Array.from(new Set([...(channel?.fixedHashtags ?? []), ...tags])).map((tag) => (
                  <button key={tag} type="button" className={`choice ${tags.includes(tag) ? "on" : ""}`} aria-pressed={tags.includes(tag)} onClick={() => setTags(toggle(tags, tag))}>#{tag}</button>
                ))}
              </div>
              <div className="row">
                <input type="text" style={{ maxWidth: 260 }} value={tagDraft} placeholder={t("create.text.hashtagPlaceholder")} aria-label={t("create.text.hashtagAdd")}
                  onChange={(e) => setTagDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }} />
                <button type="button" className="btn sm" onClick={addTag}>{t("create.text.hashtagAdd")}</button>
              </div>
            </div>
            <div className="stack" style={{ gap: 10 }}>
              <div className="row">
                <button type="button" className="btn sm ochre" disabled={aiBusy} onClick={suggest}>✨ {aiBusy ? t("create.text.aiLoading") : t("create.text.ai")}</button>
                <span className="small muted">{t("create.text.aiHint")}</span>
              </div>
              {aiError && <div className="flash error" role="alert" style={{ margin: 0 }}>{aiError}</div>}
              {ai.length > 0 && (
                <div className="stack" style={{ gap: 8 }}>
                  <span className="label">{t("create.text.aiTitle")}</span>
                  {ai.map((s, i) => (
                    <div key={i} className="prompt-box">
                      <p>{s.description}</p>
                      <span className="small muted">{s.hashtags.map((h) => `#${h}`).join(" ")}</span>
                      <button type="button" className="btn sm primary" onClick={() => { setDescription(s.description); setTags(Array.from(new Set([...tags, ...s.hashtags]))); }}>{t("create.text.aiUse")}</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="stack" style={{ gap: 16 }}>
            <h2>{t("create.where.title")}</h2>
            {channels.length > 1 && (
              <label className="field">{t("create.where.account")}
                <select value={channelId} onChange={(e) => setChannelId(e.target.value)}>
                  {channels.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
            )}
            <span className="label">{t("create.where.networks")}</span>
            <div className="grid grid-2" style={{ gap: 12 }}>
              {PLATFORMS.map((p) => {
                const acc = channel?.networks.find((n) => n.platform === p);
                const on = platforms.includes(p);
                const list = issues[p] ?? [];
                const photoBlocked = mediaType === "image" && p === "youtube";
                return (
                  <div key={p} className={`net-card ${on ? "on" : ""} ${!acc?.available || photoBlocked ? "off" : ""}`}>
                    <label className="check">
                      <input type="checkbox" checked={on} disabled={!acc?.available || photoBlocked} onChange={() => setPlatforms(toggle(platforms, p))} />
                      <span className={`net ${p}`} aria-hidden="true">{p === "youtube" ? "YT" : p === "tiktok" ? "TT" : "IG"}</span>
                      <span><strong><NetName p={p} /></strong><br /><span className="small muted">{acc?.available ? (acc.handle ?? "") : acc?.note ? t(`create.where.${acc.note}`) : t("create.where.notConnected")}</span></span>
                    </label>
                    {on && (
                      <>
                        <p className="caption-preview">{composeCaption({ platform: p, title: title.trim(), description: description.trim(), hashtags: tags }) || "—"}</p>
                        <span className="small muted">{composeCaption({ platform: p, title: title.trim(), description: description.trim(), hashtags: tags }).length}/{PLATFORM_LIMITS[p].descriptionMax}</span>
                        {list.length === 0 ? <span className="small ok-line">✓ {t("create.where.ok")}</span> : (
                          <ul className="issues">{list.map((i, k) => <li key={k} className={i.severity}>{t(i.messageKey, i.params)}</li>)}</ul>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
            {platforms.length === 0 && <p className="small muted" style={{ margin: 0 }}>{t("create.where.none")}</p>}
          </div>
        )}

        {step === 3 && (
          <div className="stack" style={{ gap: 14 }}>
            <h2>{t("create.when.title")}</h2>
            <div className="grid grid-2" style={{ gap: 12 }}>
              {([["now", "now", "nowHint"], ["at", "at", "atHint"], ["next", "next", "nextHint"]] as const).map(([m, k, h]) => (
                <button key={m} type="button" className={`big-choice ${mode === m ? "on" : ""}`} aria-pressed={mode === m} onClick={() => setMode(m)}>
                  <strong>{t(`create.when.${k}`)}</strong>
                  <span className="small muted">{t(`create.when.${h}`, { tz: channel?.timezone ?? "" })}</span>
                </button>
              ))}
            </div>
            {mode === "at" && (
              <label className="field" style={{ maxWidth: 320 }}>{t("create.when.date")}
                <input type="datetime-local" value={whenLocal} onChange={(e) => setWhenLocal(e.target.value)} />
              </label>
            )}
          </div>
        )}

        {step === 4 && (
          <div className="stack" style={{ gap: 14 }}>
            <h2>{t("create.summary.title")}</h2>
            <div className="summary">
              <div className="summary-media">{preview && (mediaType === "image" ? <img src={preview} alt="" /> : <video src={preview} muted playsInline />)}</div>
              <dl>
                <dt>{t("create.summary.file")}</dt><dd>{file?.name}</dd>
                <dt>{t("create.summary.text")}</dt><dd><strong>{title}</strong><br />{description || <span className="muted">{t("create.summary.none")}</span>}<br /><span className="muted">{tags.map((x) => `#${x}`).join(" ")}</span></dd>
                <dt>{t("create.summary.networks")}</dt><dd>{platforms.map((p) => t(`platform.${p}`)).join(", ") || "—"} · {channel?.name}</dd>
                <dt>{t("create.summary.when")}</dt><dd>{whenLabel}</dd>
              </dl>
            </div>
            {error.length > 0 && <div className="flash error" role="alert">{error.map((e, i) => <div key={i}>{e}</div>)}</div>}
          </div>
        )}
      </section>

      <div className="wizard-nav">
        <button type="button" className="btn ghost" disabled={step === 0 || sending} onClick={() => setStep(step - 1)}>{t("create.back")}</button>
        <div className="row">
          {step >= 1 && file && title.trim() && <button type="button" className="btn" disabled={sending} onClick={() => send("draft")}>{t("create.saveDraft")}</button>}
          {step < STEPS - 1 ? (
            <button type="button" className="btn primary" disabled={!canNext} onClick={() => setStep(step + 1)}>{t("create.next")}</button>
          ) : (
            <button type="button" className="btn primary" disabled={sending || blocking || platforms.length === 0} onClick={() => send(mode)}>
              {sending ? t("create.sending") : mode === "now" ? t("create.publishNow") : t("create.schedule")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
