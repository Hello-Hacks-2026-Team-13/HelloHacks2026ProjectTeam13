# Across

The mobile and web client is built with React Native, Expo, TypeScript, and Expo Router. The Node.js backend uses Express and TypeScript. Supabase provides live authentication and shared persistence. TMDB, RAWG, and TheMealDB provide movie, co-op game, and recipe ideas.

## Try the draft

Requires Node 22.12+ (Node 24 LTS recommended).

```sh
npm install
npm run dev
```

Expo starts the backend and frontend together. Open the Expo URL printed in the terminal, press `w` for the web app, or scan the QR code with Expo Go. The local web URL is usually <http://localhost:8081>; the API runs on port 3001. No provider credentials are needed for the demo.

On a physical phone, the app uses the Expo development server's host to reach the API. Keep the phone and computer on the same network. If that address is unreachable, copy `frontend/.env.example` to `frontend/.env` and set `EXPO_PUBLIC_API_URL` to your computer's LAN address, such as `http://192.168.1.42:3001`. The backend binds to the local network in development; your firewall may ask whether to allow Node.js.

1. Enter a name and create a space.
2. Choose **Add demo partner** from the home screen or Connections, or join with the invite code from another client.
3. Edit **Our time** for your time zone, available weekdays/hours, movie genres, country, and maximum date length. In demo mode, **Our time** also lets you edit the sample partner's hours.
4. Choose **Find our next date** for one movie, one online co-op game, and one recipe. Choose **Show different ideas** to replace all three with unseen picks. Each suggestion includes a time that fits the whole activity; allow at least a 90-minute shared window.
5. Suggest a date. Your suggestion counts as your acceptance.
6. Use **Demo: Alex says yes**, or accept from the other browser profile. Only then does the plan become saved.
7. Export a saved plan as an `.ics` calendar file or share its details.

Demo sessions are isolated by a random token stored in the browser or device; state persists in ignored `backend/.data/demo.json`. The demo is for local development and refuses to start with `NODE_ENV=production`. Demo accounts and plans do not migrate into live mode.

## Connect your existing projects

No Codex plugins are needed to run these integrations. Configure your app's credentials in the ignored `backend/.env` file; do not paste secrets into chat or commit them. For compatibility, provider keys in a local `backend/apis.env` are also read when the same key isn't set in `backend/.env`.

```sh
cp backend/.env.example backend/.env
```

Leave `APP_MODE=demo` until the setup below is complete.

If you already have `backend/.env`, update `APP_ORIGIN` to the Expo Web URL (`http://localhost:8081`). Keep your existing provider secret values when editing it.

`APP_ORIGIN` is the Expo Web origin used for browser CORS. The example uses `http://localhost:8081`. When testing Expo Web from a phone, add its web origin (for example, `http://192.168.1.42:8081`) to `APP_ALLOWED_ORIGINS`. For the native app, set `EXPO_PUBLIC_API_URL` in `frontend/.env` to the computer's LAN API address; native API requests do not use the browser CORS allowlist.

### 1. Supabase: accounts and plans

- Run [`supabase/schema.sql`](supabase/schema.sql) once in your project's SQL Editor. It creates `rooms`, `memberships`, and two transactional pairing functions. Also run [`supabase/pair_removal.sql`](supabase/pair_removal.sql) to install the pairing removal function and allow solo accounts to switch spaces. If you applied an earlier version of that file, run the updated one again. For an existing project, run [`supabase/remove_google_calendar.sql`](supabase/remove_google_calendar.sql) once to delete old Google sync tokens, OAuth states, and profile flags, then re-run `pair_removal.sql` to replace the old functions. Review existing table names before applying to a project that already has data.
- Set `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, and `SUPABASE_SECRET_KEY` in `backend/.env` from your project's **Connect** dialog or **Settings → API Keys**. The publishable key is used by the app for Supabase Auth; the secret key stays on the Express server and bypasses RLS, so never put it in frontend code or an `EXPO_PUBLIC_` variable.
- In **Authentication → URL Configuration**, set the local web Site URL to `http://localhost:8081` and allow it as a redirect URL. For installed native builds, allow the `across://**` redirect pattern for the app's deep link scheme.
- Enable email authentication. Sign-in uses emailed magic links with PKCE. For local web, open each link in the same browser that requested it; on native builds, the link returns through the Across app scheme.
- Supabase's built-in email sender restricts delivery and is rate limited. Configure a custom SMTP provider in Supabase before testing with arbitrary partner email addresses.
- Set `APP_MODE=live` and restart `npm run dev`. Create two actual accounts, then share a one-use invite code. Codes expire after 24 hours.

Tables have RLS enabled and no client access policies. All application data requests go through Express, which validates the Supabase access token, derives the user ID from that validated token, and checks membership before using its server-side database client. The secret key never reaches the app. Invitations are stored as SHA-256 digests. Row locking and a unique user membership prevent double joins; optimistic version checks prevent concurrent acceptances from overwriting each other.

Either partner can remove the pairing from **Connections** after several confirmation steps. This immediately deletes the shared room and plans, memberships, and invite from Supabase. Individual Supabase sign-in accounts are retained. After the pairing is removed, either account can join a different space with an invite code or create a new one.

Partner state refreshes every 10 seconds. This draft uses polling, not Supabase Realtime.

### 2. TMDB: movie suggestions

- Request API access in your [TMDB account settings](https://www.themoviedb.org/settings/api).
- Set `TMDB_READ_ACCESS_TOKEN` to the **API Read Access Token** (the long bearer token, not the short API key).
- Restart the server. This integration can also be tested in demo mode.

The server first searches genres both partners selected, then falls back to any genre selected by either partner (OR matching) if no suitable unseen shared-genre movie is found. If neither person selects genres, the genre filter is omitted. It checks actual runtimes against their maximum duration, checks provider availability in each partner's country, and fits the entire runtime into a shared window. Availability may mean subscription, free/ad-supported viewing, rental, or purchase; the app does not check either partner's subscriptions or synchronize playback. Provider results are advisory and should be confirmed before a date.

If a provider fails or no complete unseen movie/game/recipe set fits, the app keeps the previous ideas and reports why. Without credentials, demo movie-night cards are explicitly labeled as samples. Movie descriptions are not sent to an LLM.

### 3. RAWG and TheMealDB: game and recipe ideas

- Get a RAWG key from [RAWG API docs](https://rawg.io/apidocs) and set `RAWG_API_KEY` in `backend/.env`. The server requests highly rated games tagged for online co-op and adds a link back to RAWG. Follow RAWG's current plan, request limits, and attribution terms.
- TheMealDB's free developer test key is `1`, so `THEMEALDB_API_KEY=1` works for local development. Replace it with a supporter key if you have one. The server requests a random recipe, retries up to five times if it has already been shown, and links to its recipe/source page.
- Both services are called only by the backend; keys are not sent to the app. A refresh succeeds only when all three new categories are available. Provider errors, exhausted search results, or incompatible schedules leave the existing set unchanged and show an explanation. Credential-free demo mode includes three clearly labeled sample sets.
- Under **Our time → Games you enjoy**, choose Action, Adventure, Puzzle, RPG, Strategy, or Simulation. Game matching follows the movie policy: search shared genres first, then any genre either partner likes (OR), always retaining online co-op and repeat prevention. Leaving everything unselected means no preference; if only one partner chooses genres, use theirs. Older profiles without `gameGenres` remain compatible. Preferences persist in room JSON, so no SQL migration is needed. Credential-free demo cards remain generic samples, just like movie samples.
- Game ideas reserve 60 minutes and recipe ideas reserve 90 minutes in the shared schedule. Check the game platforms and recipe preparation time before confirming a date.

The relevant settings are in the optional integration section of `backend/.env.example`. Copy it to `backend/.env` if you haven't already, add `RAWG_API_KEY`, and keep `THEMEALDB_API_KEY=1` or replace it with your supporter key. Restart the backend after editing the file. See the [RAWG API docs](https://rawg.io/apidocs) and [TheMealDB API guide](https://www.themealdb.com/docs_api_guide.php) for current access details.

Data attribution appears in **Connections**. TMDB noncommercial use requires attribution; commercial use needs their licensing review. Watch-provider data is from JustWatch.

## Verification

```sh
npm run build  # Backend type check + frontend type check and production build
npm test       # Scheduling, validation, mutual acceptance, and local API integration
npm run format
```

Tests cover DST, fractional timezone offsets, weekdays, duration limits, existing plan conflicts, missing/no overlap, outsiders, expired dates, idempotent votes, single-use pairing, persistent saved plans, and cancellation. The API integration test uses a temporary data directory and a separate loopback port; it does not touch your Supabase project.

Live Supabase SQL/auth and authenticated TMDB, RAWG, or TheMealDB responses require provider credentials and aren't exercised by the local test suite.

## Project layout

```text
frontend/src/app/          Expo Router screens for home, time, ideas, plans, and connections
frontend/src/lib/across.tsx Demo and Supabase session handling plus API access
frontend/src/components/   Shared native UI and profile editor
frontend/.env.example      API URL for local device development
frontend_old/              Previous React/Vite client retained as a reference
shared/types.ts            Shared domain types
backend/src/index.ts       Authenticated Express API
backend/src/domain.ts      Availability matching and acceptance rules
backend/src/store.ts       Local persistence and Supabase storage
backend/src/activities.ts  TMDB, RAWG, TheMealDB, and persistent non-repeating sets
backend/test/              Unit and API integration tests
supabase/schema.sql        Database setup and private access rules
supabase/pair_removal.sql  Pair removal and solo-space replacement
backend/.env.example       Backend and provider integration settings
```

## First-draft boundaries

- One active pair per account. Either partner can remove the pairing; deleting it does not delete either Supabase sign-in account.
- One daily availability window; overnight windows and per-day overrides are not built yet.
- Slots are searched in 15-minute increments over the next seven days, with at least 15 minutes' lead time. UTC timestamps are converted using IANA time zones.
- A suggestion records the proposer’s acceptance. Both partners must accept before it is saved. Either partner may cancel it.
- No background reminders, calendar sync or write access, chat, photo uploads, or video calls. The asynchronous prompt can be copied into an existing messaging app.
- Small-project JSON room storage is intentional for this draft; normalize plans and activity history before scaling beyond a prototype.

## Deployment later

Build with `npm run build`, set `NODE_ENV=production`, `APP_MODE=live`, `HOST=0.0.0.0`, and `APP_ORIGIN=https://your-domain`, then run `npm start`. Express serves `frontend/dist` and `/api` from one origin. Update Supabase redirect configuration. Keep `tsx` available in the runtime install. If deploying behind a trusted reverse proxy, configure Express trust-proxy explicitly for your host before using IP-based rate limiting. The local demo is not a public hosting mode.

### Our daily moment

Open **Our moment** (or the home card) after pairing. A shared collection of 28 prompts rotates without consecutive repeats. Each person can take or choose one photo and replace it until reveal. Accepted uploads are still JPEG, PNG, or WebP images up to 5 MB; HEIC can work when the device converts it, otherwise export as JPEG. The server validates image bytes, strips EXIF/location metadata, and saves a JPEG at up to 1600 px. It does not retain the original upload.

The first photo reveal is one local day after the pair first opens the feature, using the current time as the default daily reveal time. Either partner can change the reveal time in the check-in screen. The prompt becomes available 12 hours before each photo reveal; each person can upload one photo during that window. The selected timezone stays fixed for this pairing, so travel or preference changes do not move deadlines. Across daylight saving, an occasional local day lasts 23 or 25 elapsed hours. Both partners see the deadline in their own timezone. Photos never reveal early, even if both submit. A missing submission does not block the other photo.

After reveal, each partner can leave one editable emoji/message (up to 240 characters) per photo. Revealed photos and reactions stay available for exactly 24 elapsed hours; the next daily prompt opens 12 hours after the reveal. There is no archive. The API denies expired photo reads immediately, even if the cleanup worker is behind. Removing a pairing also removes its photos.

**Live setup:** run `supabase/daily_moments.sql` once in the Supabase SQL Editor after `schema.sql`. This creates the private `daily-moments` bucket and blocks direct client access, including when other permissive storage policies exist. All photo reads/uploads go through the authenticated API, which checks pair membership and reveal/expiry times. No new key or third-party API is needed. Never make this bucket public.

**Retention:** while the Node API is running, its startup/minute worker deletes expired storage objects and photo/reaction metadata. Failed deletions are retried. Unreferenced uploads are removed after a 15-minute grace period to protect in-flight writes. If the API is stopped or storage is unavailable, physical deletion waits until it recovers; use an always-on backend for live retention. Demo photos live in ignored `backend/.data/moments`. Prompts/schedule metadata are reusable; photo content and reactions are not kept as memories. Photos downloaded or screenshotted outside Across cannot be removed by this timer. Provider backups follow the provider’s retention settings.

**Device setup:** the Expo image-picker plugin supplies camera/photo permission descriptions without microphone access. Native development builds must be rebuilt to include the added module. The picker is also supported on web; camera availability depends on the device/browser. `expo-image-picker` is pinned to SDK 57 patch `57.0.19` because the newer recommended patch was excluded by the local npm release-age policy during installation.

**Verification:** `npm test` includes image validation/replacement, owner-only previews, partner/outsider denial, no pre-reveal reactions, one-sided reveal, message limits, pairing removal, prompt rotation, timezone/date-line/DST boundaries, and exact access expiry. Live Supabase storage and physical-device camera permission flows require project/device testing.

### Rotating date ideas

A shared `suggestionHistory` in the existing room JSON stores the IDs of every successfully displayed recommendation and normalized movie/game titles. Refreshes also exclude legacy offers and plans. History survives page reloads, API restarts, profile edits, and switching between partners; it lasts for the lifetime of that shared space. There is no automatic history reset or repeat fallback. No SQL migration or new credentials are required.

All ideas contains exactly one movie, one game, and one recipe. Category tabs filter this trio. Movie selection prioritizes shared genres, then falls back to either partner’s genres with OR matching while retaining actual runtime and watch options in both countries. Games reserve 60 minutes and recipes 90 minutes; recipe times are session estimates. Each activity must fit a shared free window, accounting for existing plans. For bounded provider work, each search checks up to five movie result pages per genre tier, five game result pages per genre tier and five random recipe responses. A search may fail before the provider's full catalog is exhausted; the UI reports that no complete fresh set was found in that search rather than repeating an item.

The three offers and their history commit together. Concurrent partner changes to preferences, plans, or suggestions reject the stale search; the person can retry against the updated space. Failed searches neither replace the old set nor consume unseen candidates. Provider-backed tests use mocked responses; API integration tests use credential-free samples and never read optional `apis.env` provider keys when `NODE_ENV=test`.
