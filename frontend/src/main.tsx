import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import './index.css'

import LoginPage from './features/auth/LoginPage'
import RegisterPage from './features/auth/RegisterPage'
import ForgotPasswordPage from './features/auth/ForgotPasswordPage'
import ResetPasswordPage from './features/auth/ResetPasswordPage'
import VerifyEmailPage from './features/auth/VerifyEmailPage'
import LandingPage from './features/marketing/LandingPage'
import PrivacyPolicyPage from './features/marketing/PrivacyPolicyPage'
import TermsOfServicePage from './features/marketing/TermsOfServicePage'
import DashboardPage from './features/dashboard/DashboardPage'
import ProjectsPage from './features/projects/ProjectsPage'
import BillingPage from './features/billing/BillingPage'
import TeamPage from './features/team/TeamPage'
import SettingsPage from './features/settings/SettingsPage'
import TimeTrackingPage from './features/time/TimeTrackingPage'
import AnalyticsPage from './features/analytics/AnalyticsPage'
import ScreenshotsPage from './features/screenshots/ScreenshotsPage'
import ActivityPage from './features/activity/ActivityPage'
import InvoicesPage from './features/invoices/InvoicesPage'

import { Shell } from './layouts/Shell'
import { useAuthStore } from './store/authStore'
import AdminDashboardPage from './features/admin/AdminDashboardPage'
import MemberTrackingPage from './features/team/MemberTrackingPage'
import { canAccessPath, isSuperAdmin } from './utils/access'
import { isDesktopApp } from './utils/electronAuth'
import { DesktopTitleBar } from './components/WindowControls'

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated } = useAuthStore();
  return isAuthenticated ? <Shell>{children}</Shell> : <Navigate to="/login" />;
};

const SuperAdminRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated, user } = useAuthStore();
  if (!isAuthenticated) return <Navigate to="/login" />;
  if (!isSuperAdmin(user)) return <Navigate to="/app" replace />;
  return <Shell>{children}</Shell>;
};

const MemberTrackingRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated, user } = useAuthStore();
  if (!isAuthenticated) return <Navigate to="/login" />;
  if (!canAccessPath(user, '/team/member')) return <Navigate to="/app" replace />;
  return <Shell>{children}</Shell>;
};

const RoleRoute = ({ path, children }: { path: string; children: React.ReactNode }) => {
  const { isAuthenticated, user } = useAuthStore();
  if (!isAuthenticated) return <Navigate to="/login" />;
  if (!canAccessPath(user, path)) return <Navigate to="/app" replace />;
  return <Shell>{children}</Shell>;
};

const RootPage = () => {
  if (isDesktopApp()) {
    const { isAuthenticated } = useAuthStore();
    return <Navigate to={isAuthenticated ? '/app' : '/login'} replace />;
  }
  return <LandingPage />;
};

const RegisterRoute = () => {
  if (isDesktopApp()) {
    return <Navigate to="/login" replace />;
  }
  return <RegisterPage />;
};

const FallbackRedirect = () => (
  <Navigate to={isDesktopApp() ? '/login' : '/app'} replace />
);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Router>
      <DesktopTitleBar />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterRoute />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/verify-email" element={<VerifyEmailPage />} />
        <Route path="/" element={<RootPage />} />
        <Route path="/privacy" element={<PrivacyPolicyPage />} />
        <Route path="/terms" element={<TermsOfServicePage />} />

        {/* Tracker routes — all authenticated users */}
        <Route path="/app" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
        <Route path="/time" element={<ProtectedRoute><TimeTrackingPage /></ProtectedRoute>} />
        <Route path="/activity" element={<ProtectedRoute><ActivityPage /></ProtectedRoute>} />
        <Route path="/screenshots" element={<ProtectedRoute><ScreenshotsPage /></ProtectedRoute>} />

        {/* Admin-only routes */}
        <Route path="/projects" element={<RoleRoute path="/projects"><ProjectsPage /></RoleRoute>} />
        <Route path="/billing" element={<RoleRoute path="/billing"><BillingPage /></RoleRoute>} />
        <Route path="/team" element={<RoleRoute path="/team"><TeamPage /></RoleRoute>} />
        <Route path="/team/member/:userId" element={<MemberTrackingRoute><MemberTrackingPage /></MemberTrackingRoute>} />
        <Route path="/settings" element={<RoleRoute path="/settings"><SettingsPage /></RoleRoute>} />
        <Route path="/analytics" element={<RoleRoute path="/analytics"><AnalyticsPage /></RoleRoute>} />
        <Route path="/invoices" element={<RoleRoute path="/invoices"><InvoicesPage /></RoleRoute>} />
        <Route path="/admin" element={<SuperAdminRoute><AdminDashboardPage /></SuperAdminRoute>} />

        {/* Fallback */}
        <Route path="*" element={<FallbackRedirect />} />
      </Routes>
    </Router>
  </StrictMode>,
)
