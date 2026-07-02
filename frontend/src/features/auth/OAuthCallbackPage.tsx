import { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Loader2, Sparkles } from 'lucide-react';
import { authService } from '../../api/authService';
import { useAuthStore } from '../../store/authStore';
import { persistAuthTokens } from '../../utils/authStorage';
import { syncElectronAuthToken } from '../../utils/electronAuth';

const OAuthCallbackPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const setAuth = useAuthStore((state) => state.setAuth);
  const setUser = useAuthStore((state) => state.setUser);
  const [error, setError] = useState<string | null>(null);
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;

    const params = new URLSearchParams(location.search);
    const oauthError = params.get('oauth_error');
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');
    const organizationId = params.get('organization_id');

    if (oauthError || !accessToken || !refreshToken) {
      navigate('/login', {
        replace: true,
        state: { message: oauthError || 'Social sign-in failed. Please try again.' },
      });
      return;
    }

    const finalize = async () => {
      try {
        persistAuthTokens({
          access_token: accessToken,
          refresh_token: refreshToken,
          organization_id: organizationId ? Number(organizationId) : null,
        });
        syncElectronAuthToken(accessToken);

        const profile = await authService.me();
        setAuth(profile.data, accessToken);
        setUser(profile.data);

        navigate('/app', { replace: true });
      } catch {
        setError('We could not complete your sign-in. Please try again.');
        setTimeout(() => navigate('/login', { replace: true }), 2500);
      }
    };

    void finalize();
  }, [location.search, navigate, setAuth, setUser]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-4">
      <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-ai-gradient shadow-ai">
        <Sparkles className="w-7 h-7 text-white" />
      </div>
      {error ? (
        <p className="text-accent text-sm">{error}</p>
      ) : (
        <div className="flex items-center gap-3 text-slate-400">
          <Loader2 className="w-5 h-5 animate-spin text-primary-500" />
          <span>Signing you in…</span>
        </div>
      )}
    </div>
  );
};

export default OAuthCallbackPage;
