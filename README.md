# GridCast

**Upload once. Cast everywhere.** A scheduler for short-form vertical video across YouTube Shorts, TikTok and Instagram Reels.

> The product name lives in one constant, `APP.name` in `src/config.ts`, so you can rename it later.

## Run it (Phase 1)

```bash
npm install
cp .env.example .env.local   # defaults are fine for Phase 1
npm run dev                  # http://localhost:3000
npm test                     # unit tests (scheduler, validation, retries, encryption)
```

On first load, the app seeds the **Bioniche** and **Pepito Alerta** channels with templates, queue rules and six demo videos (tagged `demo`). To start empty, delete `.data/` and run `npm run seed -- --no-demo`.

### Try the whole flow
1. **Library**: pick a channel and drop in some vertical videos (several at once is fine). The app reads duration and dimensions in the browser and falls back to `ffprobe` on the server when it's installed. New uploads start as **Draft**. Click **Mark ready**.
2. **Dashboard → Fill queue**: every ready video gets a free slot from the queue rules, plus one version per platform with the channel template applied. These are **proposed** only. Nothing goes out until you approve it.
3. Approve one by one, or use **Approve all valid**. Versions that fail validation (not 9:16, too long, captions over the limit, past their expiry date) can't be approved.
4. **Calendar**: drag a video to another day. All of its platform versions move together and go back to "needs OK" unless autopilot is on.
5. **Dashboard → Run due publishes** publishes everything that's due through the dry-run publisher. Posts get marked published with a fake id, and nothing reaches any platform.
6. **Scheduler tick**: in production, call `GET /api/cron/tick` every minute with `Authorization: Bearer $CRON_SECRET`. Each tick fills the queue, publishes what's due (with retries at 5, 20 and 60 min), raises low-queue alerts and sends them to Telegram if it's configured.

## Install as an app (PWA)

GridCast is an installable PWA. In Chrome or Edge on desktop or Android, use the **Install app** button (bottom-right) or the install icon in the address bar. On iPhone, open the site in Safari, then Share → **Add to Home Screen**.
- The service worker (`public/sw.js`) caches static assets and the pages you visit, so the app opens fast and still shows recent pages when you're offline. If a page isn't cached, you get an offline screen.
- Anything that changes data (uploads, approvals, publishing, `/api/*`) always goes to the server and is never cached.

## Deploy to Vercel

1. On vercel.com, go to **Add New → Project** and import `lagoanadia/gridcast`. The framework (Next.js) is detected automatically.
2. Under **Environment Variables**, add:
   - `CRON_SECRET`: any long random string.
   - `PUBLISHER_MODE`: `dry-run`
3. Click **Deploy**. After that, every push to the branch redeploys automatically.

**Limits of this deployment until Supabase is connected (Phase 1b):**
- On Vercel, data lives in `/tmp`, which is temporary and **separate for each server instance**. Your data resets and can even look different between requests. The app shows a banner saying so. Treat it as a demo.
- Vercel functions accept request bodies of about 4.5 MB, so uploads are capped at 4 MB there. Real videos will upload straight to Supabase Storage.
- The scheduler: Vercel Cron on the Hobby plan only runs once a day. Publishing at exact times needs Vercel Pro (per-minute cron), an external pinger calling `/api/cron/tick`, or Inngest (Phase 2).

## Architecture

| Area | Where |
|---|---|
| Domain types (match the DB 1:1, every row has `userId`) | `src/lib/types.ts` |
| Platform limits and validation | `src/lib/platforms.ts` |
| Templates → platform versions | `src/lib/templates.ts` |
| Queue planner (time-zone aware, skips expired videos) | `src/lib/scheduler.ts` |
| Approve, move, publish, retry, alerts | `src/lib/services.ts` |
| `Publisher` interface and dry-run implementation | `src/lib/publisher/` |
| Token encryption (AES-256-GCM) | `src/lib/crypto.ts` |
| Translations (all UI text) | `messages/en.json`, `src/lib/i18n.ts` |
| Postgres schema with RLS (Phase 1b) | `supabase/migrations/0001_init.sql` |

Phase 1 stores data in a local JSON file (`.data/db.json`) and uploads in `.data/uploads/`. That way the app runs with zero accounts. All domain logic is storage-agnostic, and the Supabase schema and RLS policies are already written.

## Phases

- **Phase 1 (this version)**: library with bulk upload, templates, per-platform versions with validation, automatic queue, calendar with drag-and-drop, approval flow and autopilot, low-queue alerts, retries, dry-run publishing.
- **Phase 1b**: Supabase auth, Postgres and Storage (direct browser uploads), replacing the JSON store.
- **Phase 2**: real publishing via Ayrshare behind `Publisher`, YouTube first. Email alerts. Inngest for jobs.
- **Phase 3**: Whisper transcription, Claude-generated titles, descriptions and hashtags (claude-haiku-5-5), thumbnail frames, planning agent (claude-sonnet-5-5), expiry detection, video ideas.
- **Phase 4**: metrics at 24 h, 7 d and 28 d, format comparison with sample sizes, best publishing times, CSV export.

## Platform limits to keep in mind

- **YouTube Data API**: the default quota is 10,000 units/day, and one upload costs about 1,600 units, so roughly **6 uploads/day per Google Cloud project** unless you request more quota. Videos uploaded through an **unaudited API project are locked to private**. Ayrshare avoids this because its app is already audited.
- **TikTok Content Posting API**: needs an app review, and until the app is audited, posts are **private-only** (Ayrshare covers this as well). Business accounts have extra music restrictions.
- **Instagram Reels**: needs an Instagram **Business or Creator account linked to a Facebook Page**. The API limit is 50 posts per 24 h.
- **Ayrshare**: posting to several platforms and accessing analytics requires a paid plan. Check which plan includes TikTok and YouTube analytics.
- The duration, size and caption limits in `src/lib/platforms.ts` change often. Re-check them before launch.
