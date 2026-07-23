import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Button, Input } from '../../components/ui';
import { LogIn, Github, Mail, Sparkles, Globe } from 'lucide-react';

import { useNavigate, useLocation, Link } from 'react-router-dom';
import { authService } from '../../api/authService';
import { useAuthStore } from '../../store/authStore';
import { isDesktopApp } from '../../utils/electronAuth';
import { getSavedLoginCredentials, persistAuthTokens, saveLoginCredentials } from '../../utils/authStorage';
import { startOAuthLogin } from '../../utils/oauth';
import {
  browserSignInErrorMessage,
  completeDesktopBrowserSignIn,
  navigateAfterLogin,
  startDesktopBrowserSignIn,
  subscribeDesktopBrowserSignIn,
} from '../../utils/desktopBrowserAuth';
import SeoHead from '../../seo/SeoHead';
import { getApiErrorMessage } from '../../utils/apiError';
import { useToastStore } from '../../store/toastStore';

const TWO_FACTOR_REQUIRED = 'Two-factor authentication code is required';

const LoginPage = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const setAuth = useAuthStore((state) => state.setAuth);
  const setUser = useAuthStore((state) => state.setUser);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const savedCredentials = getSavedLoginCredentials();
  const [email, setEmail] = useState(savedCredentials?.email ?? '');
  const [password, setPassword] = useState(savedCredentials?.password ?? '');
  const [requiresTwoFactor, setRequiresTwoFactor] = useState(false);
  const [totpCode, setTotpCode] = useState('');
  const [browserSignInPending, setBrowserSignInPending] = useState(false);
  
  const successMessage = location.state?.message 
    ?? (new URLSearchParams(location.search).get('signed_out') ? 'Signed out successfully. Log in with your account.' : null);

  const desktop = isDesktopApp();

  useEffect(() => {
    useToastStore.getState().clear();
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      navigateAfterLogin(location.search, navigate);
    }
  }, [isAuthenticated, location.search, navigate]);

  useEffect(() => {
    if (!desktop) return undefined;

    return subscribeDesktopBrowserSignIn({
      onComplete: async (tokens) => {
        setBrowserSignInPending(false);
        setError(null);
        try {
          await completeDesktopBrowserSignIn(tokens);
          navigateAfterLogin(location.search, navigate);
        } catch (err: unknown) {
          setError(getApiErrorMessage(err, 'Could not complete browser sign-in.'));
        }
      },
      onError: (message) => {
        setBrowserSignInPending(false);
        setError(browserSignInErrorMessage(message));
      },
    });
  }, [desktop, location.search, navigate]);

  useEffect(() => {
    const saved = getSavedLoginCredentials();
    if (saved) {
      setEmail(saved.email);
      setPassword(saved.password);
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    const submittedEmail = email.trim();
    const submittedPassword = password;

    try {
      const response = await authService.login(
        submittedEmail,
        submittedPassword,
        requiresTwoFactor ? totpCode.trim() : undefined,
      );
      persistAuthTokens({
        access_token: response.data.tokens.access_token,
        refresh_token: response.data.tokens.refresh_token,
        organization_id: (response.data.tokens as { organization_id?: number }).organization_id
          ?? response.data.user.organization_id
          ?? null,
      });
      saveLoginCredentials(submittedEmail, submittedPassword);
      setAuth(response.data.user, response.data.tokens.access_token);

      const profile = await authService.me();
      setUser(profile.data);

      navigateAfterLogin(location.search, navigate);
    } catch (err: unknown) {
      const message = getApiErrorMessage(err, 'Invalid email or password.');
      if (message === TWO_FACTOR_REQUIRED) {
        setRequiresTwoFactor(true);
        setError(null);
      } else {
        setError(message);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleBrowserSignIn = async () => {
    setBrowserSignInPending(true);
    setError(null);
    try {
      const result = await startDesktopBrowserSignIn();
      if (!result.success) {
        setBrowserSignInPending(false);
        setError(browserSignInErrorMessage(result.error));
      }
    } catch (err: unknown) {
      setBrowserSignInPending(false);
      setError(getApiErrorMessage(err, 'Could not open browser sign-in.'));
    }
  };

  return (
    <div className={`relative flex min-h-screen items-center justify-center overflow-hidden bg-background ${desktop ? 'p-4 pt-10' : 'p-6'}`}>
      {!desktop && (
        <SeoHead
          title="Sign In — FlowTrack"
          description="Sign in to your FlowTrack account to access time tracking, screenshots, team analytics, and billing."
          canonicalPath="/login"
          noindex
        />
      )}

      {!desktop && (
        <>
          <motion.div
            animate={{ scale: [1, 1.2, 1], x: [0, 50, 0], y: [0, 30, 0] }}
            transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
            className="absolute -top-24 -left-24 h-96 w-96 rounded-full bg-primary-500/10 blur-[100px]"
          />
          <motion.div
            animate={{ scale: [1, 1.5, 1], x: [0, -70, 0], y: [0, -50, 0] }}
            transition={{ duration: 15, repeat: Infinity, ease: 'easeInOut' }}
            className="absolute -bottom-24 -right-24 h-[500px] w-[500px] rounded-full bg-secondary-500/10 blur-[120px]"
          />
        </>
      )}

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className={`relative z-10 w-full ${desktop ? 'max-w-sm' : 'max-w-md'}`}
      >
        <div className={`text-center ${desktop ? 'mb-5' : 'mb-8'}`}>
          {!desktop && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 260, damping: 20, delay: 0.2 }}
              className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-ai-gradient shadow-ai"
            >
              <Sparkles className="h-8 w-8 text-white" />
            </motion.div>
          )}
          <h1 className={`font-extrabold tracking-tight text-white ${desktop ? 'text-2xl mb-1' : 'text-4xl mb-2'}`}>
            {desktop ? (
              <>Sign in to <span className="gradient-text">FlowTrack</span></>
            ) : (
              <>Welcome to <span className="gradient-text">FlowTrack</span></>
            )}
          </h1>
          <p className="text-sm text-slate-400">
            {desktop ? 'Desktop time tracker' : 'Quantum time tracking for modern teams.'}
          </p>
        </div>

        <div className={desktop ? 'rounded-2xl border border-white/10 bg-white/[0.03] p-5' : 'glass-card'}>
          <form onSubmit={handleSubmit} className="space-y-4">
            {successMessage && !error && (
              <div className="rounded-xl border border-green-500/20 bg-green-500/10 p-3 text-center text-sm text-green-400">
                {successMessage}
              </div>
            )}

            {error && (
              <div className="rounded-xl border border-accent/20 bg-accent/10 p-3 text-center text-sm text-accent">
                {error}
              </div>
            )}

            <Input
              label="Email Address"
              name="email"
              type="email"
              placeholder="name@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              required
            />
            <div className="space-y-1">
              <Input
                label="Password"
                name="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
              {!desktop && (
                <div className="text-right">
                  <Link to="/forgot-password" className="text-xs text-primary-400 transition-colors hover:text-primary-300">
                    Forgot password?
                  </Link>
                </div>
              )}
            </div>

            {requiresTwoFactor && (
              <div className="space-y-1">
                <Input
                  label="Authentication Code"
                  name="totp_code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="123456"
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value)}
                  autoFocus
                  required
                />
                <p className="text-xs text-slate-500">
                  Enter the 6-digit code from your authenticator app.
                </p>
              </div>
            )}

            <Button type="submit" className="w-full" isLoading={isLoading}>
              <LogIn className="mr-2 h-4 w-4" />
              {requiresTwoFactor ? 'Verify & Sign In' : desktop ? 'Sign In' : 'Sign In to FlowTrack'}
            </Button>

            {desktop && (
              <>
                <div className="relative my-5">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-white/10" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-[#12141C] px-2 text-slate-500">Or</span>
                  </div>
                </div>

                <Button
                  type="button"
                  variant="secondary"
                  className="w-full"
                  isLoading={browserSignInPending}
                  onClick={() => void handleBrowserSignIn()}
                >
                  <Globe className="mr-2 h-4 w-4" />
                  Sign in with browser
                </Button>
                <p className="text-center text-xs text-slate-500">
                  Opens your browser. If you are already signed in on the web, the desktop app will connect automatically.
                </p>
              </>
            )}

            {!desktop && (
              <>
                <div className="relative my-8">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-white/10" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-[#12141C] px-2 text-slate-500">Or continue with</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <Button variant="secondary" type="button" className="w-full px-0" onClick={() => startOAuthLogin('github')}>
                    <Github className="mr-2 h-4 w-4" />
                    GitHub
                  </Button>
                  <Button variant="secondary" type="button" className="w-full px-0" onClick={() => startOAuthLogin('google')}>
                    <Mail className="mr-2 h-4 w-4" />
                    Google
                  </Button>
                </div>
              </>
            )}
          </form>

          {!desktop && (
            <p className="mt-8 text-center text-sm text-slate-400">
              Don&apos;t have an account?{' '}
              <Link to="/register" className="font-semibold text-primary-400 transition-colors hover:text-primary-300">
                Start Free Trial
              </Link>
            </p>
          )}
        </div>

        {!desktop && (
          <div className="mt-8 text-center text-xs text-slate-500">
            Powered by Global AI Network • Secure Protocol v2.4
          </div>
        )}
      </motion.div>
    </div>
  );
};

export default LoginPage;
