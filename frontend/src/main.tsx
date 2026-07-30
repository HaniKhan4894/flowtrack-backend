import { StrictMode, Suspense, lazy, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, HashRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import './index.css'

import { Shell } from './layouts/Shell'
import { AdminShell } from './layouts/AdminShell'
import { TrackerProtectedRoute, DesktopOnlyTrackerRoute, DesktopOnlyTrackerLoginRoute } from './features/desktop-tracker/DesktopTrackerLayout'
import { useAuthStore } from './store/authStore'
import { canAccessPath, isSuperAdmin, isPathPlanLocked } from './utils/access'
import { isDesktopApp, getDesktopLoginPath, getAppLoginPath } from './utils/electronAuth'
import { initDesktopLifecycle } from './utils/desktopLifecycle'
import { DesktopTitleBar } from './components/WindowControls'
import { AppQueryProvider } from './lib/queryClient'
import { ToastViewport, PageSkeleton, PlanLockedState } from './components/ui'
import { CommandPalette } from './components/CommandPalette'
import { ShortcutsHelp } from './components/ShortcutsHelp'
import { ThemeProvider } from './components/ThemeProvider'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'

const LoginPage = lazy(() => import('./features/auth/LoginPage'))
const RegisterPage = lazy(() => import('./features/auth/RegisterPage'))
const ForgotPasswordPage = lazy(() => import('./features/auth/ForgotPasswordPage'))
const ResetPasswordPage = lazy(() => import('./features/auth/ResetPasswordPage'))
const VerifyEmailPage = lazy(() => import('./features/auth/VerifyEmailPage'))
const OAuthCallbackPage = lazy(() => import('./features/auth/OAuthCallbackPage'))
const DesktopAuthBridgePage = lazy(() => import('./features/auth/DesktopAuthBridgePage'))
const LandingPage = lazy(() => import('./features/marketing/LandingPage'))
const PrivacyPolicyPage = lazy(() => import('./features/marketing/PrivacyPolicyPage'))
const TermsOfServicePage = lazy(() => import('./features/marketing/TermsOfServicePage'))
const DashboardPage = lazy(() => import('./features/dashboard/DashboardPage'))
const ProjectsPage = lazy(() => import('./features/projects/ProjectsPage'))
const BillingPage = lazy(() => import('./features/billing/BillingPage'))
const TeamPage = lazy(() => import('./features/team/TeamPage'))
const SettingsPage = lazy(() => import('./features/settings/SettingsPage'))
const TimeTrackingPage = lazy(() => import('./features/time/TimeTrackingPage'))
const AnalyticsPage = lazy(() => import('./features/analytics/AnalyticsPage'))
const TimeSummaryPage = lazy(() => import('./features/analytics/TimeSummaryPage'))
const ScreenshotsPage = lazy(() => import('./features/screenshots/ScreenshotsPage'))
const ActivityPage = lazy(() => import('./features/activity/ActivityPage'))
const InvoicesPage = lazy(() => import('./features/invoices/InvoicesPage'))
const InvoiceDetailPage = lazy(() => import('./features/invoices/InvoiceDetailPage'))
const TimesheetsPage = lazy(() => import('./features/timesheets/TimesheetsPage'))
const PayrollPage = lazy(() => import('./features/payroll/PayrollPage'))
const PayrollRunDetailPage = lazy(() => import('./features/payroll/PayrollRunDetailPage'))
const ClientsPage = lazy(() => import('./features/clients/ClientsPage'))
const LeavePage = lazy(() => import('./features/leave/LeavePage'))
const InsightsPage = lazy(() => import('./features/insights/InsightsPage'))
const DailyStandupPage = lazy(() => import('./features/standup/DailyStandupPage'))
const WellbeingPage = lazy(() => import('./features/wellbeing/WellbeingPage'))
const ProofOfWorkPage = lazy(() => import('./features/proof/ProofOfWorkPage'))
const ClientPortalPage = lazy(() => import('./features/portal/ClientPortalPage'))
const IntegrationsPage = lazy(() => import('./features/integrations/IntegrationsPage'))
const JiraHubPage = lazy(() => import('./features/integrations/JiraHubPage'))
const GitHubHubPage = lazy(() => import('./features/integrations/GitHubHubPage'))
const SlackHubPage = lazy(() => import('./features/integrations/SlackHubPage'))
const AdminOverviewPage = lazy(() => import('./features/admin/AdminOverviewPage'))
const AdminOrganizationsPage = lazy(() => import('./features/admin/AdminOrganizationsPage'))
const AdminOrganizationDetailPage = lazy(() => import('./features/admin/AdminOrganizationDetailPage'))
const AdminUsersPage = lazy(() => import('./features/admin/AdminUsersPage'))
const AdminUserDetailPage = lazy(() => import('./features/admin/AdminUserDetailPage'))
const AdminSubscriptionsPage = lazy(() => import('./features/admin/AdminSubscriptionsPage'))
const AdminPlansPage = lazy(() => import('./features/admin/AdminPlansPage'))
const AdminUsagePage = lazy(() => import('./features/admin/AdminUsagePage'))
const AdminAuditPage = lazy(() => import('./features/admin/AdminAuditPage'))
const AdminAnnouncementsPage = lazy(() => import('./features/admin/AdminAnnouncementsPage'))
const AdminHealthPage = lazy(() => import('./features/admin/AdminHealthPage'))
const AdminPaymentsPage = lazy(() => import('./features/admin/AdminPaymentsPage'))
const AdminGrowthPage = lazy(() => import('./features/admin/AdminGrowthPage'))
const AdminCampaignsPage = lazy(() => import('./features/admin/AdminCampaignsPage'))
const AdminCampaignDetailPage = lazy(() => import('./features/admin/AdminCampaignDetailPage'))
const AdminCouponsPage = lazy(() => import('./features/admin/AdminCouponsPage'))
const MemberTrackingPage = lazy(() => import('./features/team/MemberTrackingPage'))
const AdvancedMonitoringReportPage = lazy(() => import('./features/team/AdvancedMonitoringReportPage'))
const ActivityFeedPage = lazy(() => import('./features/activity/ActivityFeedPage'))
const OnboardingPage = lazy(() => import('./features/onboarding/OnboardingPage'))
const DesktopTrackerPage = lazy(() => import('./features/desktop-tracker/DesktopTrackerPage'))

const RouteFallback = () => (
  <div className="min-h-[50vh] p-6">
    <PageSkeleton />
  </div>
)

const AuthBootLoader = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <PageSkeleton />
  </div>
)

const Lazy = ({ children }: { children: ReactNode }) => (
  <Suspense fallback={<RouteFallback />}>{children}</Suspense>
)

const ProtectedRoute = ({ children }: { children: ReactNode }) => {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const sessionReady = useAuthStore((s) => s.sessionReady)
  if (!sessionReady) return <AuthBootLoader />
  return isAuthenticated ? <Shell><Lazy>{children}</Lazy></Shell> : <Navigate to={getAppLoginPath()} />
}

const SuperAdminRoute = ({ children }: { children: ReactNode }) => {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const user = useAuthStore((s) => s.user)
  const sessionReady = useAuthStore((s) => s.sessionReady)
  if (!sessionReady) return <AuthBootLoader />
  if (!isAuthenticated) return <Navigate to={getAppLoginPath()} />
  if (!isSuperAdmin(user)) return <Navigate to="/app" replace />
  return <AdminShell><Lazy>{children}</Lazy></AdminShell>
}

const MemberTrackingRoute = ({ children }: { children: ReactNode }) => {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const user = useAuthStore((s) => s.user)
  if (!isAuthenticated) return <Navigate to={getAppLoginPath()} />
  if (!canAccessPath(user, '/team/member')) return <Navigate to="/app" replace />
  return <Shell><Lazy>{children}</Lazy></Shell>
}

const RoleRoute = ({ path, children }: { path: string; children: ReactNode }) => {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const user = useAuthStore((s) => s.user)
  const sessionReady = useAuthStore((s) => s.sessionReady)
  if (!sessionReady) return <AuthBootLoader />
  if (!isAuthenticated) return <Navigate to={getAppLoginPath()} />
  if (!canAccessPath(user, path)) {
    if (isPathPlanLocked(user, path)) {
      return (
        <Shell>
          <PlanLockedState featureLabel="This feature" />
        </Shell>
      )
    }
    return <Navigate to="/app" replace />
  }
  return <Shell><Lazy>{children}</Lazy></Shell>
}

const RootPage = () => {
  if (isDesktopApp()) {
    const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
    const sessionReady = useAuthStore((s) => s.sessionReady)
    if (!sessionReady) return <AuthBootLoader />
    return <Navigate to={isAuthenticated ? '/tracker' : '/tracker/login'} replace />
  }
  return (
    <Lazy>
      <LandingPage />
    </Lazy>
  )
}

const RegisterRoute = () => {
  if (isDesktopApp()) return <Navigate to={getDesktopLoginPath()} replace />
  return (
    <Lazy>
      <RegisterPage />
    </Lazy>
  )
}

const WebLoginRoute = () => {
  if (isDesktopApp()) return <Navigate to={getDesktopLoginPath()} replace />
  return (
    <Lazy>
      <LoginPage />
    </Lazy>
  )
}

const FallbackRedirect = () => (
  <Navigate to={isDesktopApp() ? getDesktopLoginPath() : '/app'} replace />
)

function AppChrome() {
  useKeyboardShortcuts()
  const location = useLocation()
  const isTrackerRoute = location.pathname.startsWith('/tracker')

  return (
    <>
      <DesktopTitleBar />
      <ToastViewport />
      {!isTrackerRoute && <CommandPalette />}
      {!isTrackerRoute && <ShortcutsHelp />}
      <Routes>
        <Route path="/login" element={<WebLoginRoute />} />
        <Route
          path="/tracker/login"
          element={(
            <DesktopOnlyTrackerLoginRoute>
              <Lazy><LoginPage /></Lazy>
            </DesktopOnlyTrackerLoginRoute>
          )}
        />
        <Route
          path="/tracker"
          element={(
            <DesktopOnlyTrackerRoute>
              <TrackerProtectedRoute>
                <Lazy><DesktopTrackerPage /></Lazy>
              </TrackerProtectedRoute>
            </DesktopOnlyTrackerRoute>
          )}
        />
        <Route path="/register" element={<RegisterRoute />} />
        <Route path="/forgot-password" element={<Lazy><ForgotPasswordPage /></Lazy>} />
        <Route path="/reset-password" element={<Lazy><ResetPasswordPage /></Lazy>} />
        <Route path="/verify-email" element={<Lazy><VerifyEmailPage /></Lazy>} />
        <Route path="/auth/callback" element={<Lazy><OAuthCallbackPage /></Lazy>} />
        <Route path="/auth/desktop-bridge" element={<Lazy><DesktopAuthBridgePage /></Lazy>} />
        <Route path="/" element={<RootPage />} />
        <Route path="/privacy" element={<Lazy><PrivacyPolicyPage /></Lazy>} />
        <Route path="/terms" element={<Lazy><TermsOfServicePage /></Lazy>} />
        <Route path="/portal/:token" element={<Lazy><ClientPortalPage /></Lazy>} />

        <Route path="/app" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
        <Route path="/time" element={<ProtectedRoute><TimeTrackingPage /></ProtectedRoute>} />
        <Route path="/timesheets" element={<RoleRoute path="/timesheets"><TimesheetsPage /></RoleRoute>} />
        <Route path="/time-summary" element={<RoleRoute path="/time-summary"><TimeSummaryPage /></RoleRoute>} />
        <Route path="/activity" element={<ProtectedRoute><ActivityPage /></ProtectedRoute>} />
        <Route path="/activity-feed" element={<ProtectedRoute><ActivityFeedPage /></ProtectedRoute>} />
        <Route path="/onboarding" element={<ProtectedRoute><OnboardingPage /></ProtectedRoute>} />
        <Route path="/screenshots" element={<RoleRoute path="/screenshots"><ScreenshotsPage /></RoleRoute>} />

        <Route path="/projects" element={<RoleRoute path="/projects"><ProjectsPage /></RoleRoute>} />
        <Route path="/billing" element={<RoleRoute path="/billing"><BillingPage /></RoleRoute>} />
        <Route path="/team" element={<RoleRoute path="/team"><TeamPage /></RoleRoute>} />
        <Route path="/team/member/:userId" element={<MemberTrackingRoute><MemberTrackingPage /></MemberTrackingRoute>} />
        <Route path="/team/member/:userId/advanced-monitoring" element={<MemberTrackingRoute><AdvancedMonitoringReportPage /></MemberTrackingRoute>} />
        <Route path="/settings" element={<RoleRoute path="/settings"><SettingsPage /></RoleRoute>} />
        <Route path="/integrations" element={<RoleRoute path="/integrations"><IntegrationsPage /></RoleRoute>} />
        <Route path="/integrations/jira" element={<ProtectedRoute><JiraHubPage /></ProtectedRoute>} />
        <Route path="/integrations/github" element={<ProtectedRoute><GitHubHubPage /></ProtectedRoute>} />
        <Route path="/integrations/slack" element={<ProtectedRoute><SlackHubPage /></ProtectedRoute>} />
        <Route path="/analytics" element={<RoleRoute path="/analytics"><AnalyticsPage /></RoleRoute>} />
        <Route path="/insights" element={<RoleRoute path="/insights"><InsightsPage /></RoleRoute>} />
        <Route path="/standup" element={<RoleRoute path="/standup"><DailyStandupPage /></RoleRoute>} />
        <Route path="/wellbeing" element={<RoleRoute path="/wellbeing"><WellbeingPage /></RoleRoute>} />
        <Route path="/proof-of-work" element={<RoleRoute path="/proof-of-work"><ProofOfWorkPage /></RoleRoute>} />
        <Route path="/invoices" element={<RoleRoute path="/invoices"><InvoicesPage /></RoleRoute>} />
        <Route path="/invoices/:id" element={<RoleRoute path="/invoices"><InvoiceDetailPage /></RoleRoute>} />
        <Route path="/clients" element={<RoleRoute path="/clients"><ClientsPage /></RoleRoute>} />
        <Route path="/leave" element={<RoleRoute path="/leave"><LeavePage /></RoleRoute>} />
        <Route path="/payroll" element={<RoleRoute path="/payroll"><PayrollPage /></RoleRoute>} />
        <Route path="/payroll/runs/:runId" element={<RoleRoute path="/payroll"><PayrollRunDetailPage /></RoleRoute>} />
        <Route path="/admin" element={<SuperAdminRoute><AdminOverviewPage /></SuperAdminRoute>} />
        <Route path="/admin/organizations" element={<SuperAdminRoute><AdminOrganizationsPage /></SuperAdminRoute>} />
        <Route path="/admin/organizations/:id" element={<SuperAdminRoute><AdminOrganizationDetailPage /></SuperAdminRoute>} />
        <Route path="/admin/users" element={<SuperAdminRoute><AdminUsersPage /></SuperAdminRoute>} />
        <Route path="/admin/users/:id" element={<SuperAdminRoute><AdminUserDetailPage /></SuperAdminRoute>} />
        <Route path="/admin/subscriptions" element={<SuperAdminRoute><AdminSubscriptionsPage /></SuperAdminRoute>} />
        <Route path="/admin/payments" element={<SuperAdminRoute><AdminPaymentsPage /></SuperAdminRoute>} />
        <Route path="/admin/growth" element={<SuperAdminRoute><AdminGrowthPage /></SuperAdminRoute>} />
        <Route path="/admin/campaigns" element={<SuperAdminRoute><AdminCampaignsPage /></SuperAdminRoute>} />
        <Route path="/admin/campaigns/:campaignId" element={<SuperAdminRoute><AdminCampaignDetailPage /></SuperAdminRoute>} />
        <Route path="/admin/coupons" element={<SuperAdminRoute><AdminCouponsPage /></SuperAdminRoute>} />
        <Route path="/admin/plans" element={<SuperAdminRoute><AdminPlansPage /></SuperAdminRoute>} />
        <Route path="/admin/usage" element={<SuperAdminRoute><AdminUsagePage /></SuperAdminRoute>} />
        <Route path="/admin/audit" element={<SuperAdminRoute><AdminAuditPage /></SuperAdminRoute>} />
        <Route path="/admin/announcements" element={<SuperAdminRoute><AdminAnnouncementsPage /></SuperAdminRoute>} />
        <Route path="/admin/health" element={<SuperAdminRoute><AdminHealthPage /></SuperAdminRoute>} />

        <Route path="*" element={<FallbackRedirect />} />
      </Routes>
    </>
  )
}

initDesktopLifecycle()

if (typeof navigator !== 'undefined' && /Electron/i.test(navigator.userAgent)) {
  document.documentElement.classList.add('electron-app')
}

const isFileProtocol = typeof window !== 'undefined' && window.location.protocol === 'file:'
const Router = isFileProtocol ? HashRouter : BrowserRouter

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppQueryProvider>
      <ThemeProvider>
        <Router>
          <AppChrome />
        </Router>
      </ThemeProvider>
    </AppQueryProvider>
  </StrictMode>,
)
