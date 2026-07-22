# Telegram Bridge for Stremio

Private bridge for media you own or may distribute. It indexes Telegram file metadata, generates direct links only on Stremio playback requests, and removes generated links after 12 hours.

## Architecture

- **Koyeb Free**: one always-needed GramJS user-session worker. UptimeRobot calls `/health` every 25 minutes so Koyeb does not sleep it.
- **Vercel**: public Stremio manifest, catalog, and stream endpoints.
- **Supabase**: source-channel index, link jobs, encrypted Telegram session, and 12-hour direct-link cache.

Files are never downloaded or stored by this project.

## Setup

1. Create a Telegram application at [my.telegram.org](https://my.telegram.org), then record `TELEGRAM_API_ID` and `TELEGRAM_API_HASH`.
2. Create Supabase project. Run [`supabase/schema.sql`](supabase/schema.sql) in SQL Editor.
3. Copy `.env.example` to `.env` locally. Set Supabase service-role key, Telegram credentials, TMDB key, and a random 64-character hex `SESSION_ENCRYPTION_KEY`.
4. Install dependencies and log in once from local terminal:

   ```powershell
   npm install
   npm run telegram:login
   ```

   This writes only encrypted session data to `worker_sessions`.
5. Add source channels in Supabase:

   ```sql
   insert into source_channels (telegram_channel) values ('source_channel_username');
   ```

6. Add link bots. `url_pattern` is optional regular expression used to extract a direct URL from a bot reply.

   ```sql
   insert into link_bots (username, url_pattern)
   values ('link_generator_bot', 'https?://[^\\s]+');
   ```

7. Deploy same repository to Koyeb using `Dockerfile`. Add shared variables and worker-only Telegram variables as Koyeb secrets. Expose port `8000`, route `/`, and configure health check `/health`.
8. Create free UptimeRobot HTTP monitor for `https://YOUR-KOYEB-APP.koyeb.app/health`, interval 25 minutes.
9. Deploy same repository to Vercel. Add `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `TMDB_API_KEY` in Vercel environment variables.
10. Install `https://YOUR-VERCEL-DOMAIN.vercel.app/manifest.json` in Stremio.

## Request lifecycle

1. Worker indexes filename/caption from all configured channels and maps titles to TMDB/IMDb.
2. Stremio search returns matching indexed films.
3. Selecting a film returns cached bot URLs younger than 12 hours.
4. Without a cache, Vercel creates a job and waits up to 45 seconds. Worker forwards only matching Telegram file to enabled link bots.
5. Worker saves all returned URLs. Stremio returns them as stream choices. If bots reply too slowly, open stream again after a moment.
6. Worker deletes cached URLs older than 12 hours each hour.

## Link bot requirements

Each bot must accept forwarded files from a normal Telegram user account and reply in its private chat with a public HTTP(S) URL. Test each bot manually before enabling it. Bot-specific menus, captchas, or buttons are not automated by this initial adapter.
