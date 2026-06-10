import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import './index.css'

import LoginPage from './features/auth/LoginPage'
import RegisterPage from './features/auth/RegisterPage'
import LandingPage from './features/marketing/LandingPage'
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
import { canAccessPath } from './utils/access'

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated } = useAuthStore();
  return isAuthenticated ? <Shell>{children}</Shell> : <Navigate to="/login" />;
};

const RoleRoute = ({ path, children }: { path: string; children: React.ReactNode }) => {
  const { isAuthenticated, user } = useAuthStore();
  if (!isAuthenticated) return <Navigate to="/login" />;
  if (!canAccessPath(user, path)) return <Navigate to="/app" replace />;
  return <Shell>{children}</Shell>;
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Router>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/" element={<LandingPage />} />
        
        {/* Tracker routes — all authenticated users */}
        <Route path="/app" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
        <Route path="/time" element={<ProtectedRoute><TimeTrackingPage /></ProtectedRoute>} />
        <Route path="/activity" element={<ProtectedRoute><ActivityPage /></ProtectedRoute>} />
        <Route path="/screenshots" element={<ProtectedRoute><ScreenshotsPage /></ProtectedRoute>} />

        {/* Admin-only routes */}
        <Route path="/projects" element={<RoleRoute path="/projects"><ProjectsPage /></RoleRoute>} />
        <Route path="/billing" element={<RoleRoute path="/billing"><BillingPage /></RoleRoute>} />
        <Route path="/team" element={<RoleRoute path="/team"><TeamPage /></RoleRoute>} />
        <Route path="/settings" element={<RoleRoute path="/settings"><SettingsPage /></RoleRoute>} />
        <Route path="/analytics" element={<RoleRoute path="/analytics"><AnalyticsPage /></RoleRoute>} />
        <Route path="/invoices" element={<RoleRoute path="/invoices"><InvoicesPage /></RoleRoute>} />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/app" />} />
      </Routes>
    </Router>
  </StrictMode>,
)
