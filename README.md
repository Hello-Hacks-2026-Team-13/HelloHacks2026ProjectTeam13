# Across

A first draft of a long-distance relationship app: **pair accounts → set preferences and available hours → find overlap → show three activities → both accept → save the plan**.

Built with React + TypeScript + Vite, Motion, Lucide, and an Express/Node API written in TypeScript. Supabase provides live authentication and shared persistence. Google Calendar contributes busy times. TMDB provides movie discovery.

## Try the draft

Requires Node 22.12+ (Node 24 LTS recommended).

```sh
npm install
npm run dev
```

Open <http://localhost:5173>. The API runs on port 3001. No credentials are needed for the local demo.

1. Enter a name and create a space.
2. Choose **Add demo partner** in the invite dialog, or join with the invite code from a second browser profile.
3. Edit **Preferences** for your time zone, available weekdays/hours, movie genres, country, and maximum date length. In demo mode, **Our time** also lets you edit Alex's hours.
4. Choose **Find our next date**. Each of the three suggestions includes a time that fits the whole activity.
5. Suggest a date. Your suggestion counts as your acceptance.
6. Use **Demo: Alex says yes**, or accept from the other browser profile. Only then does the plan become saved.
7. Download a calendar file from the saved plan if you want to import it into your calendar.

Demo sessions are isolated by a browser-stored random token; state persists in ignored `backend/.data/demo.json`. The demo is for local development and refuses to start with `NODE_ENV=production`. Demo accounts and plans do not migrate into live mode.

## Connect your existing projects

No Codex plugins are needed to run these integrations. Configure your app's credentials in the ignored `backend/.env` file; do not paste secrets into chat or commit them.

```sh
cp backend/.env.example backend/.env
openssl rand -hex 32
```

Use the generated hex value for `TOKEN_ENCRYPTION_KEY` and keep it stable. Replacing it requires reconnecting calendars. Leave `APP_MODE=demo` until the setup below is complete.

### 1. Supabase: accounts and plans

- Run [`supabase/schema.sql`](supabase/schema.sql) once in your project's SQL Editor. It creates `rooms`, `memberships`, `calendar_tokens`, `oauth_states`, and two transactional pairing functions. Review existing table names before applying to a project that already has data.
- Set `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and the server-only `SUPABASE_SERVICE_ROLE_KEY` in `backend/.env` using your project's API settings. This draft uses the legacy `anon` and `service_role` JWT keys.
- In **Authentication → URL Configuration**, set the Site URL to `http://localhost:5173` and allow `http://localhost:5173` as a redirect URL.
- Enable email authentication. Sign-in uses emailed magic links with PKCE; open each link in the same browser that requested it.
- Supabase's built-in email sender restricts delivery and is rate limited. Configure a custom SMTP provider in Supabase before testing with arbitrary partner email addresses.
- Set `APP_MODE=live` and restart `npm run dev`. Create two actual accounts, then share a one-use invite code. Codes expire after 24 hours.

Tables have RLS enabled and no browser access policies. All application data requests go through Express, which validates the Supabase access token, derives the user ID from that validated token, and checks membership before using its server-side database client. The service-role key never reaches the browser. Invitations are stored as SHA-256 digests. Row locking and a unique user membership prevent double joins; optimistic version checks prevent concurrent acceptances from overwriting each other.

Partner state refreshes every 10 seconds. This draft uses polling, not Supabase Realtime.

### 2. Google Cloud: Calendar access

- In your existing Google Cloud project, enable the **Google Calendar API**.
- Configure the OAuth consent screen in Google Auth Platform. While the app is in testing, add both testers' Google accounts under Audience / Test users.
- Add this scope under Data Access: `https://www.googleapis.com/auth/calendar.freebusy`.
- Create an OAuth client of type **Web application**.
- Add the exact authorized redirect URI: `http://localhost:5173/api/calendar/callback`.
- Put the client ID and client secret into `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `backend/.env`. Set `GOOGLE_REDIRECT_URI` to that same redirect URI and set `TOKEN_ENCRYPTION_KEY` as above.
- Restart the server. Each signed-in partner opens **Connections → Connect Google Calendar** and authorizes their own calendar.

Calendar OAuth is separate from app sign-in. The callback uses an expiring single-use state bound to an HttpOnly SameSite cookie. Refresh tokens are encrypted using AES-256-GCM at rest in Supabase. The server retrieves only primary-calendar busy intervals, not event titles or descriptions, and never returns raw calendar intervals to the partner. Busy times are fetched during matching and rechecked on acceptance. If Google fails, matching/acceptance fails visibly instead of silently treating that calendar as empty.

This version reads the **primary calendar only**. Calendar selection, push synchronization, and automatically creating Google events are future work. Accepted plans are saved in Supabase and can be exported as `.ics`; export is not two-way sync. Disconnect removes the stored token; Google account permissions can also be revoked from your Google Account settings. Google testing-mode refresh tokens can expire, requiring reconnection.

### 3. TMDB: movie suggestions

- Request API access in your [TMDB account settings](https://www.themoviedb.org/settings/api).
- Set `TMDB_READ_ACCESS_TOKEN` to the **API Read Access Token** (the long bearer token, not the short API key).
- Restart the server. This integration can also be tested in demo mode.

The server discovers movies in genres both partners selected, checks actual runtimes against their maximum duration, checks provider availability in each partner's country, and fits the entire runtime into a shared window. Availability may mean subscription, free/ad-supported viewing, rental, or purchase; the app does not check either partner's subscriptions or synchronize playback. Provider results are advisory and should be confirmed before a date.

Curated conversation/creative activities fill remaining slots. TMDB outages show a notice and preserve those alternatives. Without credentials, demo movie-night cards are explicitly labeled as samples. Movie descriptions are not sent to an LLM.

Data attribution appears in **Connections**. TMDB noncommercial use requires attribution; commercial use needs their licensing review. Watch-provider data is from JustWatch.

## Verification

```sh
npm run build  # Backend type check + frontend type check and production build
npm test       # Scheduling, validation, mutual acceptance, and local API integration
npm run format
```

Tests cover DST, fractional timezone offsets, weekdays, duration limits, calendar conflicts, missing/no overlap, outsiders, expired dates, idempotent votes, single-use pairing, persistent saved plans, and cancellation. The API integration test uses a temporary data directory and a separate loopback port; it does not touch your Supabase project.

Live Supabase SQL/auth, Google consent/token refresh, and authenticated TMDB responses must be verified with your project credentials. The local test suite does not claim to verify those external services.

## Project layout

```text
frontend/src/App.tsx       Screens, preferences, pairing, and calendar export
frontend/src/styles.css    Responsive visual design
frontend/src/lib/api.ts    Demo and Supabase session handling
shared/types.ts            Shared domain types
backend/src/index.ts       Authenticated API and OAuth callback
backend/src/domain.ts      Availability matching and acceptance rules
backend/src/store.ts       Local persistence and Supabase storage
backend/src/calendar.ts    Google OAuth, encrypted tokens, and free/busy reads
backend/src/activities.ts  TMDB matching and curated date ideas
backend/test/              Unit and API integration tests
supabase/schema.sql        Database setup and private access rules
backend/.env.example       Required integration settings
```

## First-draft boundaries

- One pair per account; unpairing/account deletion is not built yet.
- One daily availability window; overnight windows and per-day overrides are not built yet.
- Slots are searched in 15-minute increments over the next seven days, with at least 15 minutes' lead time. UTC timestamps are converted using IANA time zones.
- A suggestion records the proposer’s acceptance. Both partners must accept before it is saved. Either partner may cancel it.
- No background reminders, calendar write access, chat, photo uploads, or video calls. The asynchronous prompt can be copied into an existing messaging app.
- No automatic plan rescheduling if a calendar changes after acceptance.
- Small-project JSON room storage is intentional for this draft; normalize plans and activity history before scaling beyond a prototype.

## Deployment later

Build with `npm run build`, set `NODE_ENV=production`, `APP_MODE=live`, `HOST=0.0.0.0`, and run `npm start`. Express serves `frontend/dist` and `/api` from one origin. Set `APP_ORIGIN` to your HTTPS URL and update both Supabase redirect configuration and Google OAuth redirect URI (`https://your-domain/api/calendar/callback`). Keep `tsx` available in the runtime install. If deploying behind a trusted reverse proxy, configure Express trust-proxy explicitly for your host before using IP-based rate limiting. The local demo is not a public hosting mode.
