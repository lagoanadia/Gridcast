import { CreateWizard } from "@/components/CreateWizard";
import { getData } from "@/lib/data";
import { t } from "@/lib/i18n";
import { availability, publisherMode } from "@/lib/publisher";
import { PLATFORMS } from "@/lib/types";
import { mediaStorageEnabled } from "@/lib/media-storage";

// Without cloud storage the file goes through a Vercel function, which rejects bodies over ~4.5 MB.
// With cloud storage the browser uploads directly; Supabase's free plan allows 50 MB per file.

export default async function Create() {
  const { db } = await getData();
  const mode = publisherMode();
  const channels = db.channels.map((c) => ({
    id: c.id, name: c.name, timezone: c.timezone, slug: c.slug,
    networks: PLATFORMS.map((platform) => {
      const account = c.accounts.find((a) => a.platform === platform);
      const av = availability(platform, account, mode);
      // In test mode only networks that already exist on the account are offered.
      const available = av.ok && (mode === "live" || !!account);
      return { platform, handle: account?.handle, available, note: av.ok ? (account ? undefined : ("connect" as const)) : av.reason };
    }),
    fixedHashtags: Array.from(new Set(db.templates.filter((tp) => tp.channelId === c.id).flatMap((tp) => tp.fixedHashtags))).filter((h) => h !== "shorts"),
  }));
  const cloud = mediaStorageEnabled();
  return (
    <>
      <div className="page-head"><h1>{t("create.title")}</h1></div>
      <CreateWizard channels={channels} cloud={cloud} maxMb={cloud ? 50 : process.env.VERCEL ? 4 : undefined} />
    </>
  );
}
