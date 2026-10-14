import { redirect } from "next/navigation";
import { APP } from "@/config";
import { Logo } from "@/components/Logo";
import { authConfig, safeNext } from "@/lib/auth";
import { currentUser } from "@/lib/current-user";
import { t } from "@/lib/i18n";

export const dynamic = "force-dynamic";

const ERRORS = ["denied", "state", "google", "unverified", "forbidden", "config"];

export default async function Login({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const sp = await searchParams;
  const next = safeNext(sp.next);
  if (await currentUser()) redirect(next);
  const error = sp.error && ERRORS.includes(sp.error) ? sp.error : null;
  const configured = authConfig() !== null;
  return (
    <main className="login-wrap">
      <div className="card login-card">
        <Logo size={64} />
        <h1>{APP.name}</h1>
        <p className="muted" style={{ margin: 0 }}>{t("auth.tagline")}</p>
        {error && <div className="flash error" role="alert" style={{ margin: 0 }}>{t(`auth.error.${error}`)}</div>}
        {configured ? (
          <a className="btn primary google-btn" href={`/api/auth/google/start?next=${encodeURIComponent(next)}`}>
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path fill="#fff" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z" /><path fill="#fff" opacity=".85" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z" /><path fill="#fff" opacity=".7" d="M3.97 10.72A5.4 5.4 0 0 1 3.68 9c0-.6.1-1.18.29-1.72V4.95H.96A9 9 0 0 0 0 9c0 1.45.35 2.82.96 4.05l3.01-2.33z" /><path fill="#fff" opacity=".55" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z" /></svg>
            {t("auth.google")}
          </a>
        ) : (
          <p className="small muted" style={{ margin: 0 }}>{t("auth.notConfigured")}</p>
        )}
        <p className="small muted" style={{ margin: 0 }}>{t("auth.privacy")}</p>
      </div>
    </main>
  );
}
