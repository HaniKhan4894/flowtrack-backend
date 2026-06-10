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
4. Desktop env (optional override):
   - `FLOWTRACK_API_URL=http://localhost/flowtrack-backend/public/api/v1`

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
