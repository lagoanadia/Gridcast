import { APP } from "@/config";
import { Logo } from "@/components/Logo";
import { t } from "@/lib/i18n";
import { loginAction } from "./actions";

export default async function Login({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const sp = await searchParams;
  return (
    <div style={{ maxWidth: 380, margin: "8vh auto 0" }}>
      <form action={loginAction} className="card poster stack">
        <div className="row"><Logo size={44} /><h1 style={{ fontSize: 34 }}>{APP.name}</h1></div>
        <input type="hidden" name="next" value={sp.next ?? "/"} />
        <label className="field">
          {t("auth.password")}
          <input type="password" name="password" autoComplete="current-password" required autoFocus />
        </label>
        {sp.error && <div className="flash error small" role="alert">{t("auth.wrong")}</div>}
        <button className="btn primary">{t("auth.signIn")}</button>
      </form>
    </div>
  );
}
