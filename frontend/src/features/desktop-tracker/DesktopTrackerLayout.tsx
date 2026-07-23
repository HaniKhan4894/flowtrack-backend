import { type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { getDesktopLoginPath } from '../../utils/electronAuth';
import { PageSkeleton } from '../../components/ui';

const AuthBootLoader = () => (
  <div className="flex min-h-screen items-center justify-center bg-[#0A0C12]">
    <PageSkeleton />
  </div>
);

export function TrackerProtectedRoute({ children }: { children: ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const sessionReady = useAuthStore((s) => s.sessionReady);

  if (!sessionReady) return <AuthBootLoader />;
  if (!isAuthenticated) return <Navigate to={getDesktopLoginPath()} replace />;
  return <>{children}</>;
}
