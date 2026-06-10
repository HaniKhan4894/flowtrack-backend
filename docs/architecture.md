# FlowTrack Architecture

## Overview
FlowTrack is a multi-tenant system composed of:
- CodeIgniter API backend (`app/`)
- React frontend (`frontend/`)
- Electron desktop tracker (`desktop/`)

## High-Level Flow
1. User authenticates via `/api/v1/auth/login`.
2. JWT access token is used for API requests.
3. Timer starts via `/api/v1/time-entries/start`.
4. Desktop/web monitoring sends activity and screenshots.
5. Reports and dashboards aggregate tracked data.

## Backend Modules
- **Auth & Users:** authentication, refresh, profile.
- **Organizations & Members:** tenant scoping, invitations.
- **Projects/Tasks/Time Entries:** core tracking domain.
- **Monitoring:** screenshots and activity logs.
- **Billing:** plans/subscriptions/invoices.
- **Reports & Notifications:** analytics and user alerts.

## Security Model
- Auth via JWT filter.
- Permission checks via permission filter and RBAC roles.
- Organization context attached to request after auth.

## Data Model Highlights
- `organizations` as tenant root.
- `organization_members` maps users to org and role.
- `time_entries` linked to user/org/project.
- `screenshots` and `activity_logs` linked to `time_entries`.

## Key Endpoints
- `/api/v1/health`
- `/api/v1/auth/*`
- `/api/v1/time-entries/*`
- `/api/v1/screenshots/*`
- `/api/v1/activity-logs/*`
