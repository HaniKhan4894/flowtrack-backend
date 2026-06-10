# Incident Response Runbook

## Detect
- Monitor API error spikes, health endpoint failures, and login anomalies.
- Identify affected module (auth, timer, screenshots, reports, billing).

## Triage
- Determine severity:
  - Sev1: full outage or data exposure risk
  - Sev2: major feature broken
  - Sev3: degraded/non-critical behavior
- Capture request IDs (`X-Request-Id`) and timestamps.

## Mitigate
- If security-related, disable affected route or feature flag path.
- If deployment-related, rollback to last known stable release.
- If DB-related, check migration status and connection health.

## Resolve
- Apply patch in hotfix branch.
- Add regression test.
- Verify with smoke tests in staging.
- Deploy with monitored rollout.

## Postmortem
- Document root cause, impact, timeline, and action items.
- Track prevention tasks in backlog (tests, alerts, guardrails).
