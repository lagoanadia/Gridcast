import Link from "next/link";
import { CalendarBoard, type CalChip, type CalDay } from "@/components/CalendarBoard";
import { getData, isDryRun } from "@/lib/data";
import { t } from "@/lib/i18n";
import { addDaysYmd, zonedParts } from "@/lib/time";

const pad = (n: number) => String(n).padStart(2, "0");
const key = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ view?: string; date?: string; channel?: string }> }) {
  const sp = await searchParams;
  const { db } = getData();
  const view = sp.view === "month" ? "month" : "week";
  const tz = db.channels[0]?.timezone ?? "UTC";
  const now = new Date();
  const today = zonedParts(now, tz);
  const anchor = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date.split("-").map(Number) : [today.y, today.m, today.d];
  const [ay, am, ad] = anchor;

  // Weeks start on Monday.
  let start: { y: number; m: number; d: number };
  let count: number;
  if (view === "week") {
    const dow = new Date(Date.UTC(ay, am - 1, ad)).getUTCDay();
    start = addDaysYmd(ay, am, ad, -((dow + 6) % 7));
    count = 7;
  } else {
    const firstDow = new Date(Date.UTC(ay, am - 1, 1)).getUTCDay();
    start = addDaysYmd(ay, am, 1, -((firstDow + 6) % 7));
    const daysInMonth = new Date(Date.UTC(ay, am, 0)).getUTCDate();
    count = Math.ceil((((firstDow + 6) % 7) + daysInMonth) / 7) * 7;
  }
  const todayKey = key(today.y, today.m, today.d);
  const days: CalDay[] = Array.from({ length: count }, (_, i) => {
    const d = addDaysYmd(start.y, start.m, start.d, i);
    const k = key(d.y, d.m, d.d);
    return { key: k, num: d.d, other: view === "month" && d.m !== am, today: k === todayKey, past: k < todayKey };
  });
  const heads = Array.from({ length: 7 }, (_, i) => {
    const d = addDaysYmd(start.y, start.m, start.d, i);
    return new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: "UTC", ...(view === "week" ? { day: "numeric", month: "short" } : {}) }).format(new Date(Date.UTC(d.y, d.m - 1, d.d)));
  });

  // Group platform versions of the same video at the same time into one chip.
  const groups = new Map<string, CalChip>();
  for (const p of db.posts) {
    if (!p.scheduledAt || p.status === "cancelled") continue;
    if (sp.channel && p.channelId !== sp.channel) continue;
    const z = zonedParts(new Date(p.scheduledAt), tz);
    const g = `${p.videoId}|${p.scheduledAt}`;
    const existing = groups.get(g);
    if (existing) {
      existing.platforms.push(p.platform);
      if (p.status === "failed" || (p.status === "proposed" && existing.status !== "failed")) existing.status = p.status;
      continue;
    }
    const channel = db.channels.find((c) => c.id === p.channelId);
    groups.set(g, {
      id: p.id, dayKey: key(z.y, z.m, z.d), time: `${pad(z.hh)}:${pad(z.mm)}`,
      title: db.videos.find((v) => v.id === p.videoId)?.title ?? p.title, videoId: p.videoId,
      color: channel?.color ?? "#999", status: p.status, platforms: [p.platform],
      draggable: ["proposed", "scheduled", "failed"].includes(p.status),
    });
  }

  const shift = (n: number) => {
    const d = view === "week" ? addDaysYmd(ay, am, ad, n * 7) : (() => { const x = new Date(Date.UTC(ay, am - 1 + n, 1)); return { y: x.getUTCFullYear(), m: x.getUTCMonth() + 1, d: 1 }; })();
    return `/calendar?${new URLSearchParams({ view, date: key(d.y, d.m, d.d), ...(sp.channel ? { channel: sp.channel } : {}) })}`;
  };
  const viewHref = (v: string) => `/calendar?${new URLSearchParams({ view: v, date: key(ay, am, ad), ...(sp.channel ? { channel: sp.channel } : {}) })}`;
  const title = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(ay, am - 1, view === "week" ? ad : 1)));

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{title}</h1>
          <p>{t("calendar.dragHint")}</p>
          {isDryRun() && <div className="dry-banner" style={{ marginTop: 10 }}>● {t("common.dryRunBanner")}</div>}
        </div>
        <div className="stack" style={{ alignItems: "flex-end" }}>
          <div className="row">
            <Link className={`btn sm ${view === "week" ? "ink" : ""}`} href={viewHref("week")}>{t("calendar.week")}</Link>
            <Link className={`btn sm ${view === "month" ? "ink" : ""}`} href={viewHref("month")}>{t("calendar.month")}</Link>
          </div>
          <div className="row">
            <Link className="btn sm" href={shift(-1)} aria-label={t("calendar.prev")}>←</Link>
            <Link className="btn sm" href={`/calendar?view=${view}`}>{t("calendar.today")}</Link>
            <Link className="btn sm" href={shift(1)} aria-label={t("calendar.next")}>→</Link>
          </div>
        </div>
      </div>
      <div className="spread" style={{ marginBottom: 12 }}>
        <div className="row small">
          <Link href={`/calendar?view=${view}&date=${key(ay, am, ad)}`} className={`pill ${!sp.channel ? "scheduled" : "tag"}`}>{t("common.all")}</Link>
          {db.channels.map((c) => (
            <Link key={c.id} href={`/calendar?view=${view}&date=${key(ay, am, ad)}&channel=${c.id}`} className={`pill ${sp.channel === c.id ? "scheduled" : "tag"}`}>
              <span className="dot" style={{ background: c.color }} />{c.name}
            </Link>
          ))}
        </div>
        <span className="small muted">{t("calendar.timezone", { tz })}</span>
      </div>
      <CalendarBoard key={[...groups.values()].map((c) => `${c.id}${c.dayKey}${c.status}`).join()} days={days} chips={[...groups.values()]} heads={heads} tz={tz} view={view} needsApproval={t("calendar.needsApproval")} />
    </>
  );
}
