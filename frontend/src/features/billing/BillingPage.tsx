import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, Sparkles, Shield, Loader2, PartyPopper } from 'lucide-react';
import { Button } from '../../components/ui';
import { billingService, type Subscription } from '../../api/billingService';
import { useSearchParams } from 'react-router-dom';

const plans = [
  {
    id: 1,
    name: 'Free',
    price: '$0',
    description: 'Perfect for individual freelancers',
    features: ['1 Project', 'Basic Time Tracking', 'Desktop App', 'No Screenshots'],
    buttonText: 'Current Plan',
    variant: 'secondary'
  },
  {
    id: 2,
    name: 'Starter',
    price: '$12',
    period: '/month',
    description: 'For small teams getting started',
    features: ['Unlimited Projects', 'Activity Screenshots', 'Client Invoices', 'Project Reports'],
    buttonText: 'Upgrade to Starter',
    variant: 'primary'
  },
  {
    id: 3,
    name: 'Professional',
    price: '$10',
    period: '/base + $5/user',
    description: 'Popular for growing agencies',
    features: ['Per-User Pricing', 'Advanced Analytics', 'Productivity Scoring', 'Team Leaderboard', 'Priority Support'],
    buttonText: 'Upgrade to Pro',
    variant: 'primary',
    popular: true
  },
  {
    id: 4,
    name: 'Enterprise',
    price: 'Custom',
    description: 'Scalable solutions for corporations',
    features: ['Unlimited Users', 'Dedicated Support', 'Custom Integrations', 'White-label Reports', 'SAML/SSO'],
    buttonText: 'Contact Sales',
    variant: 'secondary'
  }
];

const BillingPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [currentSub, setCurrentSub] = useState<Subscription | null>(null);
  const [apiPlans, setApiPlans] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [subscribingId, setSubscribingId] = useState<number | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);

  useEffect(() => {
    fetchSubscription();
    billingService.getPlans().then((r) => setApiPlans(r.data ?? [])).catch(() => setApiPlans([]));
  }, []);

  useEffect(() => {
    const checkout = searchParams.get('checkout');
    const sessionId = searchParams.get('session_id');
    if (checkout === 'success' && sessionId) {
      billingService.confirmCheckout(sessionId)
        .then(() => {
          setShowSuccess(true);
          fetchSubscription();
          setTimeout(() => setShowSuccess(false), 5000);
          setSearchParams({});
        })
        .catch((e) => {
          console.error('Checkout confirmation failed', e);
          setSearchParams({});
        });
    }
  }, [searchParams, setSearchParams]);

  const fetchSubscription = async () => {
    try {
      const resp = await billingService.getSubscription();
      setCurrentSub(resp.data);
    } catch (e) {
      console.error('Failed to fetch subscription', e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubscribe = async (planId: number) => {
    if (planId === currentSub?.plan_id) return;
    
    setSubscribingId(planId);
    try {
      const resp = await billingService.createCheckoutSession(planId, billingCycle);
      const checkoutUrl = resp?.data?.url;
      if (!checkoutUrl) {
        throw new Error('Checkout URL not returned');
      }
      window.location.href = checkoutUrl;
    } catch (e) {
      console.error('Subscription failed', e);
    } finally {
      setSubscribingId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="w-10 h-10 text-primary-500 animate-spin" />
      </div>
    );
  }

  const displayPlans = apiPlans.length
    ? apiPlans.map((p: any) => ({
        id: p.id,
        name: p.name,
        price: p.price_monthly === 0 ? '$0' : `$${p.price_monthly}`,
        period: p.pricing_model === 'per_user' ? '/base + per user' : '/month',
        description: p.description || '',
        features: (p.features ?? []).slice(0, 5).map((f: any) => `${f.feature_key}: ${f.feature_value}`),
        buttonText: p.slug === 'free' ? 'Current Plan' : `Upgrade to ${p.name}`,
        variant: p.is_popular ? 'primary' : 'secondary',
        popular: !!p.is_popular,
      }))
    : plans;

  return (
    <div className="space-y-12 pb-12">
      <AnimatePresence>
        {showSuccess && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-8 left-1/2 -translate-x-1/2 z-50 bg-emerald-500 text-white px-8 py-4 rounded-3xl shadow-ai flex items-center gap-3"
          >
            <PartyPopper size={24} />
            <span className="font-bold uppercase tracking-tight">Payment successful! Subscription activated.</span>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="text-center max-w-2xl mx-auto">
        <h1 className="text-4xl font-extrabold text-white mb-4">Choose Your <span className="gradient-text">Power Level</span></h1>
        <p className="text-slate-400">Select the plan that fits your team today. Your active package is always highlighted below.</p>
        
        <div className="flex items-center justify-center gap-4 mt-8">
          <span className={`text-sm ${billingCycle === 'monthly' ? 'text-white' : 'text-slate-500'}`}>Monthly</span>
          <button 
            onClick={() => setBillingCycle(billingCycle === 'monthly' ? 'yearly' : 'monthly')}
            className="w-12 h-6 rounded-full bg-white/5 border border-white/10 relative p-1 transition-colors"
          >
            <motion.div 
              animate={{ x: billingCycle === 'monthly' ? 0 : 24 }}
              className="w-4 h-4 rounded-full bg-primary-500 shadow-ai"
            />
          </button>
          <span className={`text-sm ${billingCycle === 'yearly' ? 'text-white' : 'text-slate-500'}`}>Yearly (20% Off)</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {displayPlans.map((plan, i) => {
          const isCurrent = currentSub?.plan_id === plan.id;
          return (
            <motion.div
              key={plan.name}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              className={`glass-card relative flex flex-col ${plan.popular ? 'border-primary-500/50 bg-primary-500/5 shadow-2xl shadow-primary-500/10' : ''} ${isCurrent ? 'ring-2 ring-emerald-500/50' : ''}`}
            >
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary-500 text-white text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-widest shadow-ai flex items-center gap-1">
                  <Sparkles size={10} /> Most Popular
                </div>
              )}
              
              {isCurrent && (
                <div className="absolute -top-3 right-4 bg-emerald-500 text-white text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-widest shadow-ai flex items-center gap-1">
                   Selected Package
                </div>
              )}

              <div className="mb-8">
                <h3 className="text-xl font-bold text-white mb-2">{plan.name}</h3>
                <div className="flex items-baseline gap-1 mb-4">
                  <span className="text-4xl font-extrabold text-white">
                    {billingCycle === 'yearly' && plan.price !== 'Custom' && plan.price !== '$0' 
                      ? `$${Math.round(parseInt(plan.price.replace('$', '')) * 0.8)}` 
                      : plan.price}
                  </span>
                  <span className="text-slate-500 text-sm">{plan.period}</span>
                </div>
                <p className="text-slate-400 text-sm leading-relaxed">{plan.description}</p>
              </div>

              <div className="space-y-4 mb-10 flex-1">
                {plan.features.map((feature: string) => (
                  <div key={feature} className="flex items-start gap-3 text-sm text-slate-300">
                    <div className="mt-0.5 p-0.5 rounded-full bg-primary-500/10 text-primary-400">
                      <Check size={12} />
                    </div>
                    {feature}
                  </div>
                ))}
              </div>

              <Button 
                variant={isCurrent ? 'secondary' : (plan.variant as any)} 
                className="w-full"
                disabled={isCurrent || subscribingId !== null}
                isLoading={subscribingId === plan.id}
                onClick={() => handleSubscribe(plan.id)}
              >
                {isCurrent ? 'Current Plan' : plan.buttonText}
              </Button>
            </motion.div>
          );
        })}
      </div>

      <div className="glass-card bg-surface-100 p-8 flex flex-col md:flex-row items-center justify-between gap-8">
        <div className="flex items-center gap-6">
          <div className="w-16 h-16 rounded-2xl bg-secondary-500/10 flex items-center justify-center text-secondary-400">
            <Shield size={32} />
          </div>
          <div>
            <h4 className="text-xl font-bold text-white">Secure Enterprise Billing</h4>
            <p className="text-slate-400">All payments are encrypted via Stripe and comply with PCI-DSS standards.</p>
          </div>
        </div>
        <div className="flex gap-4">
           {/* Payment logos placeholder */}
           <div className="h-10 w-16 bg-white/5 rounded-2xl border border-white/5 flex items-center justify-center">
             <div className="text-xs font-bold text-slate-500">VISA</div>
           </div>
           <div className="h-10 w-16 bg-white/5 rounded-2xl border border-white/5 flex items-center justify-center">
             <div className="text-xs font-bold text-slate-500">MC</div>
           </div>
           <div className="h-10 w-16 bg-white/5 rounded-2xl border border-white/5 flex items-center justify-center">
             <div className="text-xs font-bold text-slate-500">AMEX</div>
           </div>
        </div>
      </div>
    </div>
  );
};

export default BillingPage;
