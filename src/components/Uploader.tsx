"use client";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

type Labels = { hint: string; pick: string; uploading: string; uploaded: string; channel: string };

/** Reads duration and dimensions in the browser, then uploads each file. */
function probe(file: File): Promise<{ durationSec?: number; width?: number; height?: number }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    v.preload = "metadata";
    v.onloadedmetadata = () => {
      resolve({ durationSec: isFinite(v.duration) ? v.duration : undefined, width: v.videoWidth || undefined, height: v.videoHeight || undefined });
      URL.revokeObjectURL(url);
    };
    v.onerror = () => { resolve({}); URL.revokeObjectURL(url); };
    v.src = url;
  });
}

export function Uploader({ channels, labels }: { channels: { id: string; name: string }[]; labels: Labels }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [channelId, setChannelId] = useState(channels[0]?.id ?? "");
  const [over, setOver] = useState(false);
  const [status, setStatus] = useState("");

  async function upload(files: FileList | File[]) {
    const list = Array.from(files).filter((f) => f.type.startsWith("video/"));
    let done = 0;
    for (const file of list) {
      setStatus(labels.uploading.replace("{done}", String(done)).replace("{total}", String(list.length)));
      const meta = await probe(file);
      const fd = new FormData();
      fd.set("file", file);
      fd.set("channelId", channelId);
      fd.set("meta", JSON.stringify(meta));
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      if (res.ok) done++;
    }
    setStatus(labels.uploaded.replace("{n}", String(done)));
    router.refresh();
  }

  return (
    <div
      className={`dropzone ${over ? "over" : ""}`}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); upload(e.dataTransfer.files); }}
    >
      <div className="row" style={{ justifyContent: "center" }}>
        <label className="field" style={{ flexDirection: "row", alignItems: "center" }}>
          {labels.channel}
          <select value={channelId} onChange={(e) => setChannelId(e.target.value)} style={{ width: "auto" }}>
            {channels.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <button type="button" className="btn primary" onClick={() => input.current?.click()}>{labels.pick}</button>
        <input ref={input} type="file" accept="video/*" multiple hidden onChange={(e) => e.target.files && upload(e.target.files)} />
      </div>
      <p className="small muted" style={{ margin: "10px 0 0" }}>{labels.hint}</p>
      {status && <p className="small" style={{ margin: "6px 0 0", fontWeight: 700 }} role="status">{status}</p>}
    </div>
  );
}
