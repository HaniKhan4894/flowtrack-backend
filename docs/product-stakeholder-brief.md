# FlowTrack — Stakeholder Brief

**Document purpose:** Answers to key product and technology questions for leadership review.  
**Product:** FlowTrack — multi-tenant time tracking, activity monitoring, and workforce operations platform.  
**Last updated:** August 2026

---

## 1. What is the complete technology stack and architecture?

### 1.1 Architecture overview

FlowTrack is a **multi-tenant SaaS platform** delivered as three applications in one monorepo:

| Component | Role | Location |
|-----------|------|----------|
| **Backend API** | Business logic, auth, billing, integrations, data | `app/` (CodeIgniter 4) |
| **Web application** | Dashboard, reports, settings, marketing site | `frontend/` (React) |
| **Desktop tracker** | Real-time timer, app/browser tracking, screenshots | `desktop/` (Electron) |

**Request flow**

```
Desktop Tracker / Web Browser
        ↓  HTTPS + JWT
CodeIgniter 4 REST API  (/api/v1/*)
        ↓
MySQL 8+ (tenant-scoped data)
        ↓
Reports · Invoices · Payroll · Analytics
```

**Tenancy & security**

- Each customer is an **organization**; all data is scoped by `organization_id`.
- **JWT** access + refresh tokens for API authentication.
- **RBAC** with granular permissions (Owner, Admin, Manager, Team Lead, Member).
- **Plan-based feature gating** (e.g. screenshots, activity tracking, invoicing) enforced at API level.

---

### 1.2 Technology stack

| Layer | Technologies |
|-------|----------------|
| **Backend** | PHP 8.1+, CodeIgniter 4, Composer |
| **Database** | MySQL 8+ (MariaDB compatible) |
| **API auth** | JWT (`firebase/php-jwt`), OAuth, 2FA (Google Authenticator) |
| **Frontend** | React 19, TypeScript, Vite 6, Tailwind CSS 4 |
| **Frontend data** | TanStack React Query, Zustand, Axios |
| **UI / charts** | Recharts, Framer Motion, Lucide React |
| **Desktop** | Electron 31, `active-win` (foreground window), `electron-updater` |
| **Payments** | Stripe (subscriptions, webhooks, platform ledger) |
| **Documents** | DomPDF (PDF), PhpSpreadsheet (Excel) |
| **Integrations** | Slack, Microsoft Teams, Jira, GitHub, Google/Outlook Calendar |
| **CI / deploy** | GitHub Actions, Vercel (frontend), Windows/macOS installers (`electron-builder`) |

**Key backend dependencies:** Stripe PHP SDK, DomPDF, PhpSpreadsheet, Google2FA.

**Scheduled jobs (CLI):**

- `tracking:sweep-timers` — split midnight timers, close orphaned sessions
- `marketing:run-campaigns` — lifecycle email campaigns
- `tracking:repair-activity` — activity/time-entry integrity checks

---

### 1.3 Core data model

| Entity | Purpose |
|--------|---------|
| `organizations` | Tenant root |
| `organization_members` | User ↔ org mapping with role |
| `projects` / `tasks` | Work structure linked to time |
| `time_entries` | Tracked sessions (start, pause, stop, manual) |
| `activity_logs` | Foreground app/browser events per session |
| `screenshots` | Captured images linked to time entries |
| `subscriptions` / `plans` | SaaS billing and feature limits |

---

### 1.4 API surface (high level)

| Module | Example endpoints |
|--------|-------------------|
| Health | `GET /api/v1/health` |
| Auth | `/api/v1/auth/*` (login, register, refresh, 2FA, OAuth) |
| Time | `/api/v1/time-entries/*` |
| Activity | `/api/v1/activity-logs/*` (sync, stats, top-apps) |
| Screenshots | `/api/v1/screenshots/*` |
| Reports | `/api/v1/reports/*` |
| Billing | Stripe webhooks, subscriptions, invoices |
| Admin | `/api/v1/admin/*` (orgs, users, plans, payments, campaigns) |

Full route map: `app/Config/Routes.php`  
API collection: `FlowTrack_API_Collection.postman_collection.json`

---

## 2. What is the current status of the product?

### 2.1 Executive summary

| Metric | Estimate |
|--------|----------|
| **Product completeness** | ~85–90% |
| **Launch readiness** | ~70–75% |
| **Beta (limited users)** | Feasible on current staging |
| **Public commercial launch** | ~4–6 weeks (hosting, QA, signing, polish) |

FlowTrack is a **working, feature-rich product** — not a prototype. Remaining work is primarily **production infrastructure, quality assurance, desktop trust (code signing), and polish**, not rebuilding core features.

---

### 2.2 Fully working — feature summary

#### Time tracking
- Start, pause, resume, stop timer (web + desktop)
- Manual time entries and edits
- Active session sync across clients
- Midnight split and orphaned timer cleanup

#### Desktop tracker (FlowTrack Tracker)
- Windows installer with auto-update (`electron-updater`)
- Foreground app detection (`active-win`)
- Browser tab/site breakdown (e.g. TikTok, YouTube, Chrome)
- Screenshot capture and cloud upload
- Idle detection, offline queue, background sync
- Compact tracker UI: week strip, summary, timesheet, screenshots tabs

#### Activity & productivity
- Activity log sync from desktop to API
- Productivity rules (app, URL, keyword) per organization
- Productive / unproductive / neutral categorization
- Bulk re-categorization of historical logs
- Team activity feed and member monitoring views

#### Organization & access control
- Multi-tenant organizations
- Member invitations and role assignment
- Granular permissions and plan feature flags
- Per-member monitoring settings

#### Projects & tasks
- Project CRUD, archive, member assignment
- Tasks linked to projects
- Time entries associated with projects/tasks

#### Timesheets & leave
- Weekly timesheet generation
- Submit, approve, reject workflow
- Leave types (annual, sick, casual, unpaid, etc.)

#### Screenshots
- Plan-based capture intervals
- Thumbnail gallery, pagination, full-size preview
- Blur/sensitivity policies (org settings)
- Signed/JWT-protected image URLs

#### Reports & analytics
- Dashboard with tracked hours and activity metrics
- Hourly timeline (productive / unproductive / neutral / idle)
- Top apps and browser tab breakdown
- Time summary, team analytics, office location breakdown
- Advanced monitoring reports (plan-gated)

#### Billing & subscriptions
- Tiered plans with feature limits
- Stripe checkout, subscriptions, webhooks
- Trial management, coupons, dunning visibility (admin)
- Organization billing page

#### Invoicing, payroll & client trust
- Invoice generation from tracked time
- Client portal: review hours, approve, record payment
- Proof-of-Work pack with integrity score
- Verifiable work certificate
- Payroll runs and payslip export (PDF)

#### Integrations
- **Slack** — commands, notifications, hub UI
- **Microsoft Teams** — commands
- **Jira** — issue linking, hub UI
- **GitHub** — commit/activity context, hub UI
- **Calendar** — Google / Outlook sync for meeting time

#### AI & insights
- AI activity categorization
- Daily standup generation
- Ask FlowTrack / insights panels
- Unusual activity detection
- Wellbeing and burnout signals
- Predictive forecasting hooks

#### Platform admin (super-admin)
- Organization and user management
- Plan and feature management
- Revenue, payments, subscriptions, coupons
- Marketing campaigns and growth segments
- System health, audit log, announcements
- User impersonation (support)

#### Marketing & onboarding
- Public landing page with pricing
- Registration, email verification, onboarding checklist
- Privacy policy and terms pages

#### Development quality
- GitHub Actions CI: PHPUnit + frontend lint/build
- Health endpoint for uptime checks
- Release checklist and incident runbooks

---

### 2.3 Still needs work before public launch

| Area | Current state | Required before launch |
|------|---------------|------------------------|
| **Production hosting** | API on WAMP + ngrok; frontend on Vercel | Dedicated production server, SSL, custom domain, env secrets management |
| **Desktop code signing** | Windows: unsigned builds; macOS: CI workflow documented | Apple Developer ID + notarization; optional Windows Authenticode signing |
| **Scheduled jobs** | CLI commands implemented | Production cron/scheduler for timer sweep, campaigns, reports |
| **Automated testing** | Basic PHPUnit (health, JWT) | Broader API integration tests; critical-path E2E tests |
| **API documentation** | Postman collection | Formal OpenAPI schema + CI contract validation (planned) |
| **QA & regression** | Core flows verified in dev | Full pass across roles, plans, desktop + web, edge cases |
| **Security & performance** | JWT, RBAC, org scoping in place | Pre-launch security review, load testing, logging/monitoring/alerting |
| **Advanced AI UX** | Backend services exist | Final polish and validation of flagship AI timesheet / forecast experiences |

---

### 2.4 Launch readiness checklist

**Ready for beta**
- [x] Core time tracking (web + desktop)
- [x] Activity and screenshot monitoring
- [x] Team management and permissions
- [x] Reports and analytics
- [x] Billing (Stripe) and plan limits
- [x] Windows desktop installer

**Required for public launch**
- [ ] Production API on stable infrastructure (not ngrok)
- [ ] Production cron jobs configured
- [ ] Desktop app code signing (macOS required; Windows recommended)
- [ ] End-to-end QA sign-off
- [ ] Security and performance review
- [ ] Monitoring and incident response in production

---

## 3. Repository layout (reference)

```
flowtrack-backend/
├── app/                  # CodeIgniter API (Controllers, Services, Models)
├── frontend/             # React web app
├── desktop/              # Electron FlowTrack Tracker
├── config/deploy.json    # API/frontend URL sync for builds
├── docs/                 # Architecture, runbooks, this document
├── public/downloads/     # Desktop installers + update metadata
└── tests/                # PHPUnit tests
```

---

## 4. One-page answers (copy for email / presentation)

**Q: What is the complete technology stack and architecture?**

> FlowTrack is a 3-tier multi-tenant SaaS: **Electron desktop tracker** + **React web app** → **CodeIgniter 4 REST API** → **MySQL**. Auth uses JWT, OAuth, and 2FA. Payments via Stripe. Integrations include Slack, Teams, Jira, GitHub, and Calendar. All data is organization-scoped with role-based permissions and plan-based feature gating.

**Q: What is fully working and what still needs development before launch?**

> **Working:** Time tracking, desktop app (timer, app/browser tracking, screenshots), activity logs, productivity rules, projects/tasks, timesheets, leave, reports, invoicing, payroll, client portal, proof-of-work, Stripe billing, integrations, AI insights, and super-admin panel.  
> **Before launch:** Production hosting, desktop code signing, production cron jobs, full QA, security review, and API documentation polish. Product is ~85–90% complete; beta is feasible now; public launch estimated at 4–6 weeks with focused infra and QA work.

---

*For technical deep-dives, see also: `docs/architecture.md`, `README.md`, `docs/runbooks/release-checklist.md`.*
