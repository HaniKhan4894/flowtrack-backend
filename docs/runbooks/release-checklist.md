# Release Checklist

## Pre-Release
- Pull latest `main`
- Run backend tests: `composer test`
- Run frontend checks: `cd frontend && npm run lint && npm run build`
- Confirm migrations are up to date: `php spark migrate:status`
- Validate health endpoint in target env: `/api/v1/health`

## Deployment
- Put app in maintenance mode (if needed)
- Apply migrations: `php spark migrate`
- Deploy backend + frontend artifacts
- Restart services/processes

## Post-Deployment
- Verify login, timer start/stop, screenshot upload
- Verify notifications and reports API
- Check logs for elevated 4xx/5xx rates
- Confirm health endpoint returns `status=ok`

## Rollback
- Revert to previous release artifact
- Rollback migrations if safe and required
- Restart services
- Re-test critical user flows
