import { deleteRuleAction, upsertRuleAction } from "../actions";
import { Flash } from "@/components/Flash";
import { getData } from "@/lib/data";
import { t } from "@/lib/i18n";
import { videosPerDay } from "@/lib/scheduler";
import { PLATFORMS, type QueueRule } from "@/lib/types";

const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const dayName = (d: number) => new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: "UTC" }).format(new Date(Date.UTC(2026, 0, 4 + d)));

function RuleForm({ rule, channels }: { rule?: QueueRule; channels: { id: string; name: string }[] }) {
  return (
    <form action={upsertRuleAction} className="stack">
      {rule && <input type="hidden" name="ruleId" value={rule.id} />}
      <div className="form-grid">
        <label className="field">{t("library.channel")}
          <select name="channelId" defaultValue={rule?.channelId}>{channels.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        </label>
        <label className="field">{t("queue.times")}<input type="text" name="times" defaultValue={rule?.times.join(", ") ?? "18:00"} /></label>
      </div>
      <fieldset style={{ border: "none", padding: 0, margin: 0 }}>
        <legend className="small" style={{ fontWeight: 600, marginBottom: 6 }}>{t("queue.days")}</legend>
        <div className="row">
          {DAY_ORDER.map((d) => (
            <label key={d} className="check"><input type="checkbox" name="days" value={d} defaultChecked={rule ? rule.daysOfWeek.includes(d) : true} />{dayName(d)}</label>
          ))}
        </div>
      </fieldset>
      <fieldset style={{ border: "none", padding: 0, margin: 0 }}>
        <legend className="small" style={{ fontWeight: 600, marginBottom: 6 }}>{t("queue.platforms")}</legend>
        <div className="row">
          {PLATFORMS.map((p) => (
            <label key={p} className="check"><input type="checkbox" name="platforms" value={p} defaultChecked={rule ? rule.platforms.includes(p) : p !== "instagram"} />{t(`platform.${p}`)}</label>
          ))}
          <label className="check" style={{ marginLeft: "auto" }}><input type="checkbox" name="active" defaultChecked={rule?.active ?? true} />{t("queue.active")}</label>
        </div>
      </fieldset>
      <div><button className="btn primary">{rule ? t("common.save") : t("queue.add")}</button></div>
    </form>
  );
}

export default async function QueuePage({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string }> }) {
  const sp = await searchParams;
  const { db } = getData();
  const channels = db.channels.map((c) => ({ id: c.id, name: c.name }));
  return (
    <>
      <div className="page-head"><div><h1>{t("queue.title")}</h1><p>{t("queue.intro")}</p></div></div>
      <Flash sp={sp} />
      <div className="grid grid-2">
        {db.queueRules.map((r) => {
          const c = db.channels.find((x) => x.id === r.channelId)!;
          return (
            <section key={r.id} className="card stack" style={{ opacity: r.active ? 1 : 0.65 }}>
              <div className="spread">
                <h3 className="row"><span className="dot" style={{ background: c.color }} />{c.name}</h3>
                <span className="pill tag">{t("queue.perDay", { n: (videosPerDay(c, [r])).toFixed(2).replace(/\.?0+$/, "") })}</span>
              </div>
              <p className="small muted" style={{ margin: 0 }}>
                {t("queue.summary", { channel: c.name, times: r.times.join(", "), days: DAY_ORDER.filter((d) => r.daysOfWeek.includes(d)).map(dayName).join(" "), platforms: r.platforms.map((p) => t(`platform.${p}`)).join(" + ") })}
              </p>
              <RuleForm rule={r} channels={channels} />
              <form action={deleteRuleAction}><input type="hidden" name="ruleId" value={r.id} /><button className="btn sm ghost danger">{t("common.delete")}</button></form>
            </section>
          );
        })}
        <section className="card stack" style={{ background: "var(--paper-2)" }}>
          <h3>{t("queue.add")}</h3>
          <RuleForm channels={channels} />
        </section>
      </div>
    </>
  );
}
