# Developer Onboarding

## Prerequisites
- PHP 8.1+, Composer
- Node.js 18+
- MySQL 8+

## Setup Steps
1. Clone repository
2. Copy env: `copy env .env`
3. Set `.env` values and `JWT_SECRET_KEY`
4. Install deps:
   - `composer install`
   - `cd frontend && npm install`
   - `cd ../desktop && npm install`
5. Run migrations: `php spark migrate`
6. Start services:
   - backend: `php spark serve`
   - frontend: `cd frontend && npm run dev`
   - desktop: `cd desktop && npm run dev`

## Quality Commands
- Backend tests: `composer test`
- Frontend lint: `cd frontend && npm run lint`
- Frontend build: `cd frontend && npm run build`

## Important Paths
- Backend API: `app/Controllers/API/V1`
- Business logic: `app/Services`
- Frontend screens: `frontend/src/features`
- Desktop tracker: `desktop/main.js`
