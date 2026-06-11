import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { CheckCircle2, Sparkles, XCircle } from 'lucide-react';
import { Button } from '../../components/ui';
import { authService } from '../../api/authService';
import SeoHead from '../../seo/SeoHead';
import { getApiErrorMessage } from '../../utils/apiError';

const VerifyEmailPage = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('Verifying your email...');

  useEffect(() => {
    const verify = async () => {
      if (!token) {
        setStatus('error');
        setMessage('Verification token is missing or invalid.');
        return;
      }

      try {
        const response = await authService.verifyEmail(token);
        setStatus('success');
        setMessage(response.message || 'Email verified successfully.');
      } catch (err: unknown) {
        setStatus('error');
        setMessage(getApiErrorMessage(err, 'Verification failed. The link may have expired.'));
      }
    };

    verify();
  }, [token]);

  return (
    <div className="relative min-h-screen flex items-center justify-center p-6 overflow-hidden bg-background">
      <SeoHead title="Verify Email — FlowTrack" description="Verify your FlowTrack account email address." canonicalPath="/verify-email" noindex />
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md relative z-10">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-ai-gradient mb-4 shadow-ai">
            <Sparkles className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-extrabold text-white mb-2">Email verification</h1>
        </div>

        <div className="glass-card text-center space-y-4">
          {status === 'loading' && <p className="text-slate-400">{message}</p>}
          {status === 'success' && (
            <>
              <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto" />
              <p className="text-emerald-300">{message}</p>
              <Link to="/login"><Button className="w-full">Sign in to FlowTrack</Button></Link>
            </>
          )}
          {status === 'error' && (
            <>
              <XCircle className="w-12 h-12 text-accent mx-auto" />
              <p className="text-accent">{message}</p>
              <Link to="/login"><Button variant="secondary" className="w-full">Go to login</Button></Link>
            </>
          )}
        </div>
      </motion.div>
    </div>
  );
};

export default VerifyEmailPage;
