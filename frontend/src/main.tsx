import { StrictMode, Suspense, lazy, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import './index.css'

import { Shell } from './layouts/Shell'
import { useAuthStore } from './store/authStore'
import { canAccessPath, isSuperAdmin, isPathPlanLocked } from './utils/access'
import { isDesktopApp } from './utils/electronAuth'
import { initDesktopLifecycle } from './utils/desktopLifecycle'
import { DesktopTitleBar } from './components/WindowControls'
import { AppQueryProvider } from './lib/queryClient'
import { ToastViewport, PageSkeleton } from './components/ui'
import { CommandPalette } from './components/CommandPalette'
import { ShortcutsHelp } from './components/ShortcutsHelp'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'

const LoginPage = lazy(() => import('./features/auth/LoginPage'))
const RegisterPage = lazy(() => import('./features/auth/RegisterPage'))
const ForgotPasswordPage = lazy(() => import('./features/auth/ForgotPasswordPage'))
const ResetPasswordPage = lazy(() => import('./features/auth/ResetPasswordPage'))
const VerifyEmailPage = lazy(() => import('./features/auth/VerifyEmailPage'))
const OAuthCallbackPage = lazy(() => import('./features/auth/OAuthCallbackPage'))
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
const AdminDashboardPage = lazy(() => import('./features/admin/AdminDashboardPage'))
const MemberTrackingPage = lazy(() => import('./features/team/MemberTrackingPage'))
const AdvancedMonitoringReportPage = lazy(() => import('./features/team/AdvancedMonitoringReportPage'))
const ActivityFeedPage = lazy(() => import('./features/activity/ActivityFeedPage'))
const OnboardingPage = lazy(() => import('./features/onboarding/OnboardingPage'))

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
  return isAuthenticated ? <Shell><Lazy>{children}</Lazy></Shell> : <Navigate to="/login" />
}

const SuperAdminRoute = ({ children }: { children: ReactNode }) => {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const user = useAuthStore((s) => s.user)
  if (!isAuthenticated) return <Navigate to="/login" />
  if (!isSuperAdmin(user)) return <Navigate to="/app" replace />
  return <Shell><Lazy>{children}</Lazy></Shell>
}

const MemberTrackingRoute = ({ children }: { children: ReactNode }) => {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const user = useAuthStore((s) => s.user)
  if (!isAuthenticated) return <Navigate to="/login" />
  if (!canAccessPath(user, '/team/member')) return <Navigate to="/app" replace />
  return <Shell><Lazy>{children}</Lazy></Shell>
}

const RoleRoute = ({ path, children }: { path: string; children: ReactNode }) => {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const user = useAuthStore((s) => s.user)
  const sessionReady = useAuthStore((s) => s.sessionReady)
  if (!sessionReady) return <AuthBootLoader />
  if (!isAuthenticated) return <Navigate to="/login" />
  if (!canAccessPath(user, path)) {
    return <Navigate to={isPathPlanLocked(user, path) ? '/billing' : '/app'} replace />
  }
  return <Shell><Lazy>{children}</Lazy></Shell>
}

const RootPage = () => {
  if (isDesktopApp()) {
    const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
    const sessionReady = useAuthStore((s) => s.sessionReady)
    if (!sessionReady) return <AuthBootLoader />
    return <Navigate to={isAuthenticated ? '/app' : '/login'} replace />
  }
  return (
    <Lazy>
      <LandingPage />
    </Lazy>
  )
}

const RegisterRoute = () => {
  if (isDesktopApp()) return <Navigate to="/login" replace />
  return (
    <Lazy>
      <RegisterPage />
    </Lazy>
  )
}

const FallbackRedirect = () => (
  <Navigate to={isDesktopApp() ? '/login' : '/app'} replace />
)

function AppChrome() {
  useKeyboardShortcuts()
  return (
    <>
      <DesktopTitleBar />
      <ToastViewport />
      <CommandPalette />
      <ShortcutsHelp />
      <Routes>
        <Route path="/login" element={<Lazy><LoginPage /></Lazy>} />
        <Route path="/register" element={<RegisterRoute />} />
        <Route path="/forgot-password" element={<Lazy><ForgotPasswordPage /></Lazy>} />
        <Route path="/reset-password" element={<Lazy><ResetPasswordPage /></Lazy>} />
        <Route path="/verify-email" element={<Lazy><VerifyEmailPage /></Lazy>} />
        <Route path="/auth/callback" element={<Lazy><OAuthCallbackPage /></Lazy>} />
        <Route path="/" element={<RootPage />} />
        <Route path="/privacy" element={<Lazy><PrivacyPolicyPage /></Lazy>} />
        <Route path="/terms" element={<Lazy><TermsOfServicePage /></Lazy>} />
        <Route path="/portal/:token" element={<Lazy><ClientPortalPage /></Lazy>} />

        <Route path="/app" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
        <Route path="/time" element={<ProtectedRoute><TimeTrackingPage /></ProtectedRoute>} />
        <Route path="/timesheets" element={<RoleRoute path="/timesheets"><TimesheetsPage /></RoleRoute>} />
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
        <Route path="/admin" element={<SuperAdminRoute><AdminDashboardPage /></SuperAdminRoute>} />

        <Route path="*" element={<FallbackRedirect />} />
      </Routes>
    </>
  )
}

initDesktopLifecycle()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppQueryProvider>
      <Router>
        <AppChrome />
      </Router>
    </AppQueryProvider>
  </StrictMode>,
)
