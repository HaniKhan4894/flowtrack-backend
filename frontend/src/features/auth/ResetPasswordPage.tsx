import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { KeyRound, Sparkles } from 'lucide-react';
import { Button, Input } from '../../components/ui';
import { authService } from '../../api/authService';
import SeoHead from '../../seo/SeoHead';

const ResetPasswordPage = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (!token) {
      setError('Reset token is missing or invalid.');
      return;
    }

    setIsLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await authService.resetPassword(token, password);
      setSuccess(response.message || 'Password has been reset successfully.');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Unable to reset password. The link may have expired.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center p-6 overflow-hidden bg-background">
      <SeoHead title="Reset Password — FlowTrack" description="Set a new password for your FlowTrack account." canonicalPath="/reset-password" noindex />
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md relative z-10">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-ai-gradient mb-4 shadow-ai">
            <Sparkles className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-extrabold text-white mb-2">Reset password</h1>
          <p className="text-slate-400">Choose a new password for your account.</p>
        </div>

        <div className="glass-card">
          {!token ? (
            <div className="text-center text-accent text-sm">Invalid or missing reset link.</div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              {success && (
                <div className="p-3 rounded-xl bg-green-500/10 border border-green-500/20 text-green-400 text-sm text-center">
                  {success}
                </div>
              )}
              {error && (
                <div className="p-3 rounded-xl bg-accent/10 border border-accent/20 text-accent text-sm text-center">
                  {error}
                </div>
              )}
              <Input
                label="New Password"
                name="password"
                type="password"
                placeholder="••••••••"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <Input
                label="Confirm Password"
                name="confirm_password"
                type="password"
                placeholder="••••••••"
                required
                minLength={6}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
              <Button type="submit" className="w-full" isLoading={isLoading}>
                <KeyRound className="w-4 h-4 mr-2" />
                Update Password
              </Button>
            </form>
          )}
          <p className="text-center text-sm text-slate-400 mt-6">
            <Link to="/login" className="text-primary-400 font-semibold hover:text-primary-300">
              Back to login
            </Link>
          </p>
        </div>
      </motion.div>
    </div>
  );
};

export default ResetPasswordPage;
