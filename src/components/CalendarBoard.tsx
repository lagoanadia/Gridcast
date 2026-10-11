"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { movePostAction } from "@/app/actions";
import { zonedToUtc } from "@/lib/time";

export type CalDay = { key: string; num: number; other: boolean; today: boolean; past: boolean };
export type CalChip = {
  id: string; // a post id from the group (siblings move together)
  dayKey: string;
  time: string; // HH:MM local
  title: string;
  videoId: string;
  color: string;
  status: string;
  platforms: string[];
  draggable: boolean;
};

export function CalendarBoard({ days, chips, heads, tz, view, needsApproval }: { days: CalDay[]; chips: CalChip[]; heads: string[]; tz: string; view: string; needsApproval: string }) {
  const router = useRouter();
  const [over, setOver] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [local, setLocal] = useState(chips);

  function drop(dayKey: string, e: React.DragEvent) {
    e.preventDefault();
    setOver(null);
    const id = e.dataTransfer.getData("text/plain");
    const chip = local.find((c) => c.id === id);
    if (!chip || chip.dayKey === dayKey) return;
    const [y, m, d] = dayKey.split("-").map(Number);
    const [hh, mm] = chip.time.split(":").map(Number);
    const iso = zonedToUtc(y, m, d, hh, mm, tz).toISOString();
    setLocal((cs) => cs.map((c) => (c.id === id ? { ...c, dayKey, status: "proposed" } : c)));
    start(async () => {
      await movePostAction(id, iso);
      router.refresh();
    });
  }

  return (
    <div className={`cal ${view}`} aria-busy={pending}>
      {heads.map((h) => <div key={h} className="cal-head">{h}</div>)}
      {days.map((day) => (
        <div
          key={day.key}
          className={`cal-day ${day.other ? "other" : ""} ${day.today ? "today" : ""} ${over === day.key ? "over" : ""}`}
          onDragOver={(e) => { if (!day.past) { e.preventDefault(); setOver(day.key); } }}
          onDragLeave={() => setOver((o) => (o === day.key ? null : o))}
          onDrop={(e) => drop(day.key, e)}
        >
          <span className="num">{day.num}</span>
          {local
            .filter((c) => c.dayKey === day.key)
            .sort((a, b) => a.time.localeCompare(b.time))
            .map((c) => (
              <Link
                key={c.id}
                href={`/videos/${c.videoId}`}
                className={`chip ${c.status}`}
                draggable={c.draggable}
                onDragStart={(e) => e.dataTransfer.setData("text/plain", c.id)}
                style={{ borderLeftWidth: 6, borderLeftStyle: "solid", borderLeftColor: c.color }}
              >
                <span className="t">{c.title}</span>
                <span className="meta">
                  <strong>{c.time}</strong>
                  <span>{c.platforms.map((p) => p.slice(0, 2).toUpperCase()).join(" · ")}</span>
                  {c.status === "proposed" && <span className="needs">· {needsApproval}</span>}
                </span>
              </Link>
            ))}
        </div>
      ))}
    </div>
  );
}
