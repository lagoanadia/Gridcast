import { addChannelAction } from "@/app/actions";
import { TimezoneField } from "@/components/TimezoneField";
import { t } from "@/lib/i18n";

/** What a brand-new user sees: nothing but a way to create their first account. */
export function Welcome({ name }: { name?: string }) {
  return (
    <section className="card welcome">
      <h1 style={{ fontSize: 30 }}>{name ? t("welcome.titleNamed", { name }) : t("welcome.title")}</h1>
      <p className="muted" style={{ margin: 0 }}>{t("welcome.body")}</p>
      <form action={addChannelAction}>
        <TimezoneField />
        <input type="text" name="name" required maxLength={60} placeholder={t("welcome.placeholder")} aria-label={t("welcome.placeholder")} />
        <button className="btn primary">{t("welcome.button")}</button>
      </form>
      <p className="small muted" style={{ margin: 0 }}>{t("welcome.hint")}</p>
    </section>
  );
}
