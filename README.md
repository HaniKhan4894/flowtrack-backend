# FlowTrack Backend

FlowTrack is a multi-tenant time-tracking platform with:
- CodeIgniter 4 backend API (`app/`, `public/`)
- React frontend (`frontend/`)
- Electron desktop tracker (`desktop/`) — compact **FlowTrack Tracker** app at `/tracker`

## Requirements

- PHP 8.1+
- Composer
- Node.js 18+
- MySQL 8+ (or MariaDB compatible)

## Environment Setup

1. Copy `env` to `.env`.
2. Set API/env values:
   - `app.baseURL`
   - `database.default.*`
   - `JWT_SECRET_KEY` (required)
   - `app.frontendURL`
3. Frontend env:
   - Create/update `frontend/.env`
   - Set `VITE_API_URL` to your backend API base (ngrok or production `/api/v1`)
   - On Vercel, set the same `VITE_API_URL` in project environment variables
4. Deploy URL (staging/production):
   - Edit `config/deploy.json` (`apiBaseUrl`, `publicBaseUrl`)
   - Run `npm run sync:deploy` to refresh frontend/desktop build env files
5. Desktop env (optional override):
   - `FLOWTRACK_API_URL` overrides `config/deploy.json` at runtime

## Install

Backend:
- `composer install`

Frontend:
- `cd frontend && npm install`

Desktop:
- `cd desktop && npm install`

## Run

From repo root:
- Backend: `php spark serve`
- Frontend: `cd frontend && npm run dev`
- Desktop: `npm run dev:desktop` (starts FlowTrack Tracker)
- All (concurrently): `npm run dev:all`

## Desktop Installers

1. Set backend `app.baseURL` in `.env` to your public URL (same host as `config/deploy.json`).
2. Update `config/deploy.json` with `apiBaseUrl`, `publicBaseUrl`, and `frontendUrl` (e.g. Vercel app URL).
3. Build Windows installer: `npm run build:desktop:win`
4. Build macOS installer (must run on macOS): `npm run build:desktop:mac`
5. Installers and update metadata (`latest.yml`, `FlowTrack.zip` on macOS) are copied to `public/downloads/` and linked from the landing page.

### Desktop auto-updates

Installed apps check `{publicBaseUrl}/downloads/` for new releases (automatically every 6 hours, or manually in **Settings → General → Check for updates**).

**To publish a new release:**

1. Bump `version` in `desktop/package.json` (semver, e.g. `1.0.0` → `1.0.1`).
2. Run `npm run sync:deploy`.
3. Build installers: `npm run build:desktop:win` and/or `npm run build:desktop:mac`.
4. Upload everything in `public/downloads/` to your server, including:
   - `FlowTrack-Setup.exe` + `latest.yml` (Windows)
   - `FlowTrack.zip` + `latest-mac.yml` (macOS auto-update)
   - `FlowTrack.dmg` (macOS manual install)
5. Users with the old app will see the update in Settings or get a desktop notification.

macOS silent auto-update requires a **signed and notarized** build in production. See [docs/desktop-mac-signing.md](docs/desktop-mac-signing.md) for GitHub Actions secrets and CI setup.

When going live, only change `config/deploy.json`, run `npm run sync:deploy`, and rebuild installers.

### Vercel + backend CORS

1. Set `app.frontendURL = 'https://flowtrackhani.vercel.app'` in backend `.env`
2. Set Vercel env `VITE_API_URL` to your backend API URL (from `config/deploy.json`)
3. Restart WAMP/Apache after `.env` changes
4. Redeploy Vercel frontend

Desktop icon:
- Source PNG: `desktop/build/icon.png` (512x512)
- Regenerate ICO: `cd desktop && npm run icons`
- Icons run automatically before `npm run build:desktop:win`

Windows build notes:
- Unsigned builds use `signAndEditExecutable: false` (avoids winCodeSign / win-unpacked symlink errors).
- App icon is embedded via `desktop/scripts/afterPack.js` (rcedit) so the installed `.exe` still gets the FlowTrack icon.
- For full `active-win` native support in packaged builds, install Visual Studio Build Tools (C++) and remove `npmRebuild: false` from `desktop/package.json`.

## Database

- Run migrations: `php spark migrate`
- Seed if needed: `php spark db:seed OrganizationSeeder`

## Scheduled Jobs

Lifecycle marketing needs a scheduler. Run every 15 minutes:

```
php spark marketing:run-campaigns
```

Time tracking integrity — run every 5 minutes:

```
php spark tracking:sweep-timers
```

This splits timers that crossed midnight and closes timers no client is backing any more
(sleeping machine, killed app, closed browser tab). Such a timer is cut back to the last
activity or screenshot plus the org idle grace, so wall-clock time is never billed without
proof of work. The `max_session_hours` tracking setting (default 12, 0 disables) caps a
session regardless.

One-off tasks:

- `php spark stripe:backfill-payments --months=24` — import historic Stripe invoices into the `platform_payments` ledger
- `php spark growth:smoke` — verify every growth/payment query still runs against the current schema
- `php spark tracking:repair-activity` — report activity logs recorded outside their time entry (add `--apply` to fix). Add `--trim-entries` to also report finished entries holding time that nothing was reporting during; `--user=ID` and `--since=YYYY-MM-DD` narrow the scan

## API Health

- `GET /api/v1/health`

Example:
- [http://localhost/flowtrack-backend/public/api/v1/health](http://localhost/flowtrack-backend/public/api/v1/health)

## Testing

- Backend tests: `composer test`
- Frontend lint/build:
  - `cd frontend && npm run lint`
  - `cd frontend && npm run build`

## Project Layout

- `app/` CodeIgniter API (controllers, services, models, filters)
- `frontend/` React app
- `desktop/` Electron tracker/capture client
- `tests/` PHPUnit tests

## Security Notes

- Never commit real secrets in `.env`.
- `JWT_SECRET_KEY` must be set in all environments.
- Use production-safe CORS origins and HTTPS in production.
