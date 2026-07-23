import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';

type BridgeStatus = 'checking' | 'redirecting' | 'success' | 'error';

export default function DesktopAuthBridgePage() {
  const location = useLocation();
  const navigate = useNavigate();
  const sessionReady = useAuthStore((s) => s.sessionReady);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const ensureValidSession = useAuthStore((s) => s.ensureValidSession);
  const [status, setStatus] = useState<BridgeStatus>('checking');
  const [message, setMessage] = useState('Connecting to FlowTrack desktop…');

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const params = new URLSearchParams(location.search);
      const port = params.get('port');
      const state = params.get('state');

      if (!port || !state || !/^\d+$/.test(port)) {
        setStatus('error');
        setMessage('Invalid desktop sign-in link. Return to the app and try again.');
        return;
      }

      await ensureValidSession();
      if (cancelled) return;

      const accessToken = localStorage.getItem('access_token');
      if (!isAuthenticated && !accessToken) {
        const returnPath = `${location.pathname}${location.search}`;
        navigate(`/login?redirect=${encodeURIComponent(returnPath)}`, { replace: true });
        return;
      }

      const token = accessToken ?? localStorage.getItem('access_token');
      if (!token) {
        setStatus('error');
        setMessage('Please sign in to your browser session first, then try again from the desktop app.');
        return;
      }

      setStatus('redirecting');
      setMessage('Sending your session to FlowTrack desktop…');

      const callbackUrl = new URL(`http://127.0.0.1:${port}/callback`);
      callbackUrl.searchParams.set('state', state);
      callbackUrl.searchParams.set('access_token', token);
      const refreshToken = localStorage.getItem('refresh_token');
      const organizationId = localStorage.getItem('organization_id');
      if (refreshToken) callbackUrl.searchParams.set('refresh_token', refreshToken);
      if (organizationId) callbackUrl.searchParams.set('organization_id', organizationId);

      window.location.replace(callbackUrl.toString());
    };

    if (sessionReady) {
      void run();
    }

    return () => {
      cancelled = true;
    };
  }, [ensureValidSession, isAuthenticated, location.pathname, location.search, navigate, sessionReady]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0A0C12] p-6 text-white">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-center">
        {status === 'error' ? (
          <AlertCircle className="mx-auto mb-4 h-10 w-10 text-rose-400" />
        ) : status === 'success' ? (
          <CheckCircle2 className="mx-auto mb-4 h-10 w-10 text-emerald-400" />
        ) : (
          <Loader2 className="mx-auto mb-4 h-10 w-10 animate-spin text-primary-400" />
        )}
        <h1 className="text-xl font-bold">Desktop sign-in</h1>
        <p className="mt-3 text-sm text-slate-400">{message}</p>
        {status === 'error' && (
          <Link
            to="/login"
            className="mt-6 inline-block text-sm font-semibold text-primary-400 hover:underline"
          >
            Sign in in browser
          </Link>
        )}
      </div>
    </div>
  );
}
