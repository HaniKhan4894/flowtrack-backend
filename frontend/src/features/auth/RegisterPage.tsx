import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Button, Input } from '../../components/ui';
import { UserPlus, Github, Mail, Sparkles, ArrowRight } from 'lucide-react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { authService } from '../../api/authService';
import { useAuthStore } from '../../store/authStore';
import { DesktopTitleBar } from '../../components/WindowControls';
import SeoHead from '../../seo/SeoHead';

const RegisterPage = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const invitationToken = searchParams.get('invitation_token');
  const setAuth = useAuthStore((state) => state.setAuth);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    
    const formData = new FormData(e.currentTarget);
    const data: any = Object.fromEntries(formData.entries());

    // Include invitation token if present in URL
    if (invitationToken) {
      data.invitation_token = invitationToken;
    }

    try {
      const response = await authService.register(data);

      if (invitationToken) {
        setAuth(response.data.user, response.data.tokens.access_token);
        localStorage.setItem('refresh_token', response.data.tokens.refresh_token);
        const orgId = (response.data.tokens as any)?.organization_id ?? (response.data.user as any)?.organization_id;
        if (orgId) {
          localStorage.setItem('organization_id', String(orgId));
        }
        navigate('/app');
        return;
      }

      navigate('/login', {
        state: {
          message: 'Account created! Please check your email and verify your account before signing in.',
        },
      });
    } catch (err: any) {
      setError(err.response?.data?.message || 'Registration failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center p-6 overflow-hidden bg-background">
      <SeoHead
        title="Create Free Account — FlowTrack Time Tracking"
        description="Start your free FlowTrack trial. Team time tracking, screenshot monitoring, productivity analytics, and desktop apps for Windows and macOS."
        keywords="FlowTrack sign up, free time tracking trial, team productivity registration"
        canonicalPath="/register"
      />
      <DesktopTitleBar />
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
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
        className="w-full max-w-md relative z-10"
      >
        <div className="text-center mb-8">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-ai-gradient mb-4 shadow-ai"
          >
            <Sparkles className="w-8 h-8 text-white" />
          </motion.div>
          <h1 className="text-4xl font-extrabold tracking-tight mb-2 text-white">
            Create <span className="gradient-text">Account</span>
          </h1>
          <p className="text-slate-400">Join the future of productivity tracking.</p>
        </div>

        <div className="glass-card">
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3 rounded-xl bg-accent/10 border border-accent/20 text-accent text-sm text-center">
                {error}
              </div>
            )}

            {invitationToken && (
               <input type="hidden" name="invitation_token" value={invitationToken} />
            )}
            
            <div className="grid grid-cols-2 gap-4">
              <Input label="First Name" name="first_name" placeholder="John" required />
              <Input label="Last Name" name="last_name" placeholder="Doe" />
            </div>
            
            <Input label="Email Address" name="email" type="email" placeholder="john@company.com" required />
            <Input label="Password" name="password" type="password" placeholder="••••••••" required />

            <Button type="submit" className="w-full mt-6" isLoading={isLoading}>
              <UserPlus className="w-4 h-4 mr-2" />
              Start Free Trial
            </Button>

            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-white/10"></div>
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-[#12141C] px-2 text-slate-500">Or join with</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Button variant="secondary" type="button" className="w-full px-0">
                <Github className="w-4 h-4 mr-2" /> GitHub
              </Button>
              <Button variant="secondary" type="button" className="w-full px-0">
                <Mail className="w-4 h-4 mr-2" /> Google
              </Button>
            </div>
          </form>

          <p className="text-center text-sm text-slate-400 mt-8">
            Already have an account?{' '}
            <Link to="/login" className="text-primary-400 font-semibold hover:text-primary-300 transition-colors inline-flex items-center">
              Login here <ArrowRight className="w-4 h-4 ml-1" />
            </Link>
          </p>
        </div>
      </motion.div>
    </div>
  );
};

export default RegisterPage;
