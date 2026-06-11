import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Mail, Sparkles, ArrowLeft } from 'lucide-react';
import { Button, Input } from '../../components/ui';
import { authService } from '../../api/authService';
import SeoHead from '../../seo/SeoHead';

const ForgotPasswordPage = () => {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await authService.forgotPassword(email);
      setSuccess(response.message || 'If the email exists, a password reset link has been sent.');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Unable to send reset email. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center p-6 overflow-hidden bg-background">
      <SeoHead title="Forgot Password — FlowTrack" description="Reset your FlowTrack account password." canonicalPath="/forgot-password" noindex />
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md relative z-10">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-ai-gradient mb-4 shadow-ai">
            <Sparkles className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-extrabold text-white mb-2">Forgot password?</h1>
          <p className="text-slate-400">Enter your email and we&apos;ll send you a reset link.</p>
        </div>

        <div className="glass-card">
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
              label="Email Address"
              name="email"
              type="email"
              placeholder="name@company.com"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Button type="submit" className="w-full" isLoading={isLoading}>
              <Mail className="w-4 h-4 mr-2" />
              Send Reset Link
            </Button>
          </form>
          <p className="text-center text-sm text-slate-400 mt-6">
            <Link to="/login" className="inline-flex items-center text-primary-400 font-semibold hover:text-primary-300">
              <ArrowLeft className="w-4 h-4 mr-1" />
              Back to login
            </Link>
          </p>
        </div>
      </motion.div>
    </div>
  );
};

export default ForgotPasswordPage;
