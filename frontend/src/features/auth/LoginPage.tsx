import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Button, Input } from '../../components/ui';
import { LogIn, Github, Mail, Sparkles } from 'lucide-react';

import { useNavigate, useLocation, Link } from 'react-router-dom';
import { authService } from '../../api/authService';
import { useAuthStore } from '../../store/authStore';
import { isDesktopApp } from '../../utils/electronAuth';
import SeoHead from '../../seo/SeoHead';
import { getApiErrorMessage } from '../../utils/apiError';

const LoginPage = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const setAuth = useAuthStore((state) => state.setAuth);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  
  const successMessage = location.state?.message 
    ?? (new URLSearchParams(location.search).get('signed_out') ? 'Signed out successfully. Log in with your account.' : null);

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/app', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;

    try {
      const response = await authService.login(email, password);
      // Attach to global store
      setAuth(response.data.user, response.data.tokens.access_token);
      localStorage.setItem('refresh_token', response.data.tokens.refresh_token);
      const orgId = (response.data.tokens as any)?.organization_id ?? (response.data.user as any)?.organization_id;
      if (orgId) {
        localStorage.setItem('organization_id', String(orgId));
      }
      
      // Navigate to dashboard
      navigate('/app');
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, 'Invalid email or password.'));
    } finally {
      setIsLoading(false);
    }
  };

  const desktop = isDesktopApp();

  return (
    <div className={`relative min-h-screen flex items-center justify-center overflow-hidden bg-background p-6 ${desktop ? 'pt-10' : ''}`}>
      <SeoHead
        title="Sign In — FlowTrack"
        description="Sign in to your FlowTrack account to access time tracking, screenshots, team analytics, and billing."
        canonicalPath="/login"
        noindex
      />
      {/* Background Animated Blobs */}
      <motion.div
        animate={{
          scale: [1, 1.2, 1],
          x: [0, 50, 0],
          y: [0, 30, 0],
        }}
        transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
        className="absolute -top-24 -left-24 w-96 h-96 bg-primary-500/10 rounded-full blur-[100px]"
      />
      <motion.div
        animate={{
          scale: [1, 1.5, 1],
          x: [0, -70, 0],
          y: [0, -50, 0],
        }}
        transition={{ duration: 15, repeat: Infinity, ease: "easeInOut" }}
        className="absolute -bottom-24 -right-24 w-[500px] h-[500px] bg-secondary-500/10 rounded-full blur-[120px]"
      />

      {/* Login Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
        className="w-full max-w-md relative z-10"
      >
        <div className="text-center mb-8">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 260, damping: 20, delay: 0.2 }}
            className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-ai-gradient mb-4 shadow-ai"
          >
            <Sparkles className="w-8 h-8 text-white" />
          </motion.div>
          <h1 className="text-4xl font-extrabold tracking-tight mb-2 text-white">
            Welcome to <span className="gradient-text">FlowTrack</span>
          </h1>
          <p className="text-slate-400">Quantum time tracking for modern teams.</p>
        </div>

        <div className="glass-card">
          <form onSubmit={handleSubmit} className="space-y-5">
            {successMessage && !error && (
              <div className="p-3 rounded-xl bg-green-500/10 border border-green-500/20 text-green-400 text-sm text-center">
                {successMessage}
              </div>
            )}
            
            {error && (
              <div className="p-3 rounded-xl bg-accent/10 border border-accent/20 text-accent text-sm text-center">
                {error}
              </div>
            )}

            <Input
              label="Email Address"
              name="email"
              type="email"
              placeholder="name@company.com"
              required
            />
            <div className="space-y-1">
              <Input
                label="Password"
                name="password"
                type="password"
                placeholder="••••••••"
                required
              />
              <div className="text-right">
                <Link to="/forgot-password" className="text-xs text-primary-400 hover:text-primary-300 transition-colors">
                  Forgot password?
                </Link>
              </div>
            </div>

            <Button type="submit" className="w-full" isLoading={isLoading}>
              <LogIn className="w-4 h-4 mr-2" />
              Sign In to FlowTrack
            </Button>

            {!desktop && (
              <>
                <div className="relative my-8">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-white/10"></div>
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-[#12141C] px-2 text-slate-500">Or continue with</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <Button variant="secondary" type="button" className="w-full px-0">
                    <Github className="w-4 h-4 mr-2" />
                    GitHub
                  </Button>
                  <Button variant="secondary" type="button" className="w-full px-0">
                    <Mail className="w-4 h-4 mr-2" />
                    Google
                  </Button>
                </div>
              </>
            )}
          </form>

          {!desktop && (
            <p className="text-center text-sm text-slate-400 mt-8">
              Don't have an account?{' '}
              <Link to="/register" className="text-primary-400 font-semibold hover:text-primary-300 transition-colors">
                Start Free Trial
              </Link>
            </p>
          )}
        </div>
        
        <div className="mt-8 text-center text-xs text-slate-500">
          Powered by Global AI Network • Secure Protocol v2.4
        </div>
      </motion.div>
    </div>
  );
};

export default LoginPage;
