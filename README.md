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

The app never creates sample data: every person starts empty and creates their own accounts. Locally there is no login (everything belongs to one development user). With Google login configured (below), each person signs in and sees only their own accounts, content and connections.

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

## Sign in with Google (one Gridcast per person)

Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and `SESSION_SECRET` (any long random string; `TOKEN_ENCRYPTION_KEY` is used if it is missing). Login turns on as soon as all three exist; without them the app is open, which is how local development runs.
- In Google Cloud Console → Credentials → your OAuth client, add these **authorized redirect URIs** (replace the domain): `https://YOUR-DOMAIN/api/auth/google/callback` (sign-in) and `https://YOUR-DOMAIN/api/oauth/google/callback` (YouTube connection). Add `http://localhost:3000/...` versions for local tests.
- OAuth consent screen: set the publishing status to **In production**, otherwise only the test users you list can sign in. Plain sign-in (openid, email, profile) needs no Google verification.
- Optional `ALLOWED_EMAILS` (comma separated) restricts who can create a Gridcast; leave it empty to let any Google account in.
- Each person's rows carry their own user id (derived from their Google account id). Pages, actions and APIs only ever read and write rows of the signed-in user; the scheduler tick works across everyone because it has its own secret.
- Public without a session: `/login`, `/api/auth/*`, `/api/cron/*` (its own secret), PWA assets and TikTok's verification file.

## Go live (use it for real)

Without any of this the app runs as a demo: data lives in a temporary file, nothing is published and uploads are capped at 4 MB.

1. **Supabase** (database + file storage). In Vercel: *Storage → Create → Supabase* (or *Integrations → Supabase*). It adds `POSTGRES_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` by itself. The table and the file bucket are created automatically on first use. From then on the app is **live**: demo data disappears, files go to the cloud and uploads can be up to 50 MB.
2. **`TOKEN_ENCRYPTION_KEY`**: generate with `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`. Needed to store access tokens encrypted. Changing it later means reconnecting accounts.
3. **`CRON_SECRET`**: any long random string, set in Vercel **and** as a GitHub Actions secret, together with the Actions variable `APP_URL`. `.github/workflows/tick.yml` then calls `/api/cron/tick` every 5 minutes, which publishes what is due.
4. **Instagram**: in *Cuentas → Conexiones* paste the access token of the professional Instagram account (see below). Each account keeps its own token, encrypted.
5. Optional: `GROQ_API_KEY` for "Sugerir con IA", `GOOGLE_CLIENT_ID/SECRET` + `APP_URL` for YouTube login.

Networks really published today: **Instagram** (photos and Reels). YouTube and TikTok show as "coming soon" in the wizard; in live mode a post for an unconnected network is refused instead of being faked.

### Instagram token (no Facebook Page needed)
1. Account must be **Professional** (Creator or Business).
2. In developers.facebook.com create an app, add the product **Instagram → API setup with Instagram login**, add the account and press **Generate token**.
3. Paste that token in *Cuentas*. Tokens last 60 days and are renewed automatically by the scheduler tick.
While the Meta app is in development mode it only works for accounts added to the app (yours and your testers'), which needs no app review.

### Limits to know
- Instagram: 50 posts per 24 h; photos must be JPEG (the wizard converts them), Reels up to 3 minutes, 9:16.
- Vercel Hobby: functions stop after 60 s; the tick waits up to 40 s for a video to be processed and retries later if it is slow.
- The scheduler runs every 5 minutes (GitHub Actions), so posts can go out a few minutes late.

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

Without `POSTGRES_URL` the app stores data in a local JSON file (`.data/db.json`) and uploads in `.data/uploads/`, so it runs with zero accounts. With it, the whole state lives in one jsonb row in Postgres (`src/lib/pgstore.ts`), read and written under a row lock.

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
