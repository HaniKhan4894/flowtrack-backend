# FlowTrack Backend

FlowTrack is a multi-tenant time-tracking platform with:
- CodeIgniter 4 backend API (`app/`, `public/`)
- React frontend (`frontend/`)
- Electron desktop tracker (`desktop/`)

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
   - Set `VITE_API_URL=http://localhost/flowtrack-backend/public/api/v1`
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
- Desktop: `cd desktop && npm run dev`
- All (concurrently): `npm run dev:all`

## Desktop Installers

1. Set backend `app.baseURL` in `.env` to your public URL (same host as `config/deploy.json`).
2. Update `config/deploy.json` with `apiBaseUrl`, `publicBaseUrl`, and `frontendUrl` (e.g. Vercel app URL).
3. Build Windows installer: `npm run build:desktop:win`
4. Build macOS installer (must run on macOS): `npm run build:desktop:mac`
5. Installers are copied to `public/downloads/` and linked from the landing page.

When going live, only change `config/deploy.json`, run `npm run sync:deploy`, and rebuild installers.

Windows build notes:
- Unsigned builds are enabled by default (`signAndEditExecutable: false`).
- For full `active-win` native support in packaged builds, install Visual Studio Build Tools (C++) and remove `npmRebuild: false` from `desktop/package.json`.

## Database

- Run migrations: `php spark migrate`
- Seed if needed: `php spark db:seed OrganizationSeeder`

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
