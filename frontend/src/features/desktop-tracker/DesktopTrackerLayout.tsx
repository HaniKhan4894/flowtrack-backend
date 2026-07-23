import { type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { getDesktopLoginPath, isDesktopApp } from '../../utils/electronAuth';
import { PageSkeleton } from '../../components/ui';

const AuthBootLoader = () => (
  <div className="flex min-h-screen items-center justify-center bg-[#0A0C12]">
    <PageSkeleton />
  </div>
);

/** Tracker UI is desktop-only — send browser users to the web app. */
export function DesktopOnlyTrackerRoute({ children }: { children: ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const sessionReady = useAuthStore((s) => s.sessionReady);

  if (!isDesktopApp()) {
    if (!sessionReady) return <AuthBootLoader />;
    return <Navigate to={isAuthenticated ? '/app' : '/login'} replace />;
  }

  return <>{children}</>;
}

export function DesktopOnlyTrackerLoginRoute({ children }: { children: ReactNode }) {
  if (!isDesktopApp()) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

export function TrackerProtectedRoute({ children }: { children: ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const sessionReady = useAuthStore((s) => s.sessionReady);

  if (!sessionReady) return <AuthBootLoader />;
  if (!isAuthenticated) return <Navigate to={getDesktopLoginPath()} replace />;
  return <>{children}</>;
}
