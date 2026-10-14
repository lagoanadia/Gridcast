import { CreateWizard } from "@/components/CreateWizard";
import { getData } from "@/lib/data";
import { t } from "@/lib/i18n";

// Vercel functions reject request bodies over ~4.5 MB; direct-to-storage uploads arrive with Supabase (Phase 1b).
const MAX_MB = process.env.VERCEL ? 4 : undefined;

export default function Create() {
  const { db } = getData();
  const channels = db.channels.map((c) => ({
    id: c.id, name: c.name, timezone: c.timezone, slug: c.slug,
    accounts: c.accounts.map((a) => ({ platform: a.platform, handle: a.handle, connected: a.connected })),
    fixedHashtags: Array.from(new Set(db.templates.filter((tp) => tp.channelId === c.id).flatMap((tp) => tp.fixedHashtags))).filter((h) => h !== "shorts"),
  }));
  return (
    <>
      <div className="page-head"><h1>{t("create.title")}</h1></div>
      <CreateWizard channels={channels} maxMb={MAX_MB} />
    </>
  );
}
