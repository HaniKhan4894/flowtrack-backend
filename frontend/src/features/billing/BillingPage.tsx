import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, Sparkles, Shield, Loader2, PartyPopper, AlertTriangle, Calendar, CreditCard, RefreshCw, ExternalLink } from 'lucide-react';
import { Button } from '../../components/ui';
import { billingService, type Subscription } from '../../api/billingService';
import { useSearchParams } from 'react-router-dom';
import { formatApiDate } from '../../utils/date';
import { formatPlanForDisplay, type ApiPlan, type DisplayPlan } from './billingPlanUtils';

const FALLBACK_PLANS: DisplayPlan[] = [
  {
    id: 1, slug: 'free', name: 'Free', priceLabel: '$0', periodLabel: 'forever',
    billingNote: 'No credit card required', description: 'Perfect for trying FlowTrack',
    features: ['1 user', '2 projects', 'Basic time tracking', 'No screenshots'],
    popular: false, isFree: true, trialDays: 0,
  },
  {
    id: 2, slug: 'starter', name: 'Starter', priceLabel: '$4.99', periodLabel: '/month',
    billingNote: 'Auto-renews monthly · cancel anytime', description: 'Small teams getting started',
    features: ['Up to 5 members', 'Screenshot monitoring', 'Activity tracking', 'CSV export'],
    popular: false, isFree: false, trialDays: 14,
  },
  {
    id: 3, slug: 'professional', name: 'Professional', priceLabel: '$9.99', periodLabel: '/month',
    billingNote: 'Auto-renews monthly · cancel anytime', description: 'Best value for growing teams',
    features: ['Up to 25 members', 'Invoicing', 'Custom roles', 'Priority support'],
    popular: true, isFree: false, trialDays: 14,
  },
  {
    id: 4, slug: 'enterprise', name: 'Enterprise', priceLabel: '$19.99', periodLabel: '/month',
    billingNote: 'Auto-renews monthly · cancel anytime', description: 'Larger teams, fair pricing',
    features: ['Unlimited members', 'SSO & white-label', 'Dedicated support', 'Unlimited retention'],
    popular: false, isFree: false, trialDays: 30,
  },
];

const BillingPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [currentSub, setCurrentSub] = useState<Subscription | null>(null);
  const [apiPlans, setApiPlans] = useState<ApiPlan[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [subscribingId, setSubscribingId] = useState<number | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
          setError('Payment received but activation failed. Contact support with your receipt.');
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

  const displayPlans: DisplayPlan[] = apiPlans.length
    ? apiPlans.map((p) => formatPlanForDisplay(p, billingCycle))
    : FALLBACK_PLANS;

  const handleSubscribe = async (plan: DisplayPlan) => {
    if (plan.isFree || plan.id === currentSub?.plan_id) return;

    setSubscribingId(plan.id);
    setError(null);
    try {
      const resp = await billingService.createCheckoutSession(plan.id, billingCycle);
      const checkoutUrl = resp?.data?.url;
      if (!checkoutUrl) throw new Error('Checkout URL not returned');
      window.location.href = checkoutUrl;
    } catch (e: unknown) {
      console.error('Subscription failed', e);
      setError('Could not start checkout. Please try again or contact support.');
    } finally {
      setSubscribingId(null);
    }
  };

  const openBillingPortal = async () => {
    setPortalLoading(true);
    setError(null);
    try {
      const resp = await billingService.openBillingPortal();
      if (resp?.data?.url) window.location.href = resp.data.url;
    } catch {
      setError('Billing portal unavailable. Subscribe to a paid plan first.');
    } finally {
      setPortalLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="w-10 h-10 text-primary-500 animate-spin" />
      </div>
    );
  }

  const hasPaidStripe = !!currentSub?.stripe_customer_id;

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
            <span className="font-bold">Payment successful! Your subscription is active and will renew automatically.</span>
          </motion.div>
        )}
      </AnimatePresence>

      {error && (
        <div className="bg-rose-500/10 border border-rose-500/30 rounded-2xl px-6 py-4 text-sm text-rose-200">{error}</div>
      )}

      {currentSub?.status === 'past_due' && (
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 bg-rose-500/10 border border-rose-500/30 rounded-2xl px-6 py-4">
          <div className="flex items-start gap-4">
            <AlertTriangle className="text-rose-400 shrink-0 mt-0.5" size={22} />
            <div>
              <p className="font-bold text-rose-200">Payment failed</p>
              <p className="text-sm text-rose-100/80 mt-1">
                Your last renewal charge did not succeed. Update your card to keep your plan active.
              </p>
            </div>
          </div>
          {hasPaidStripe && (
            <Button variant="primary" size="sm" onClick={openBillingPortal} isLoading={portalLoading}>
              Update payment method
            </Button>
          )}
        </div>
      )}

      {currentSub && currentSub.status !== 'past_due' && currentSub.cancel_at_period_end && (
        <div className="flex items-start gap-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl px-6 py-4">
          <Calendar className="text-amber-400 shrink-0 mt-0.5" size={22} />
          <div>
            <p className="font-bold text-amber-200">Subscription ends soon</p>
            <p className="text-sm text-amber-100/80 mt-1">
              Auto-renew is off. Access continues until {formatApiDate(currentSub.current_period_end)}.
            </p>
          </div>
        </div>
      )}

      {currentSub && (
        <div className="glass-card flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-primary-500/10 flex items-center justify-center text-primary-400">
              <CreditCard size={24} />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Your subscription</p>
              <p className="text-xl font-bold text-white capitalize">{currentSub.status.replace('_', ' ')}</p>
              <p className="text-sm text-slate-400 mt-1">
                {currentSub.cancel_at_period_end
                  ? <span className="text-amber-400">Ends {formatApiDate(currentSub.current_period_end)}</span>
                  : <>Next charge {formatApiDate(currentSub.current_period_end)}</>}
                {' · '}{currentSub.billing_cycle}
                {' · '}${Number(currentSub.amount).toFixed(2)}
                {currentSub.stripe_subscription_id ? ' · recurring via Stripe' : ''}
              </p>
            </div>
          </div>
          {hasPaidStripe && (
            <Button variant="secondary" size="sm" onClick={openBillingPortal} isLoading={portalLoading}>
              <ExternalLink className="w-4 h-4 mr-2" />
              Manage billing
            </Button>
          )}
        </div>
      )}

      <div className="glass-card p-6 md:p-8 border border-primary-500/20 bg-primary-500/5">
        <div className="flex items-start gap-4">
          <RefreshCw className="text-primary-400 shrink-0 mt-1" size={22} />
          <div className="space-y-2 text-sm text-slate-300">
            <p className="font-bold text-white text-base">How recurring billing works</p>
            <ul className="list-disc pl-5 space-y-1.5 text-slate-400">
              <li>You pay once at checkout — Stripe saves your card securely.</li>
              <li>Your plan <strong className="text-slate-200">renews automatically</strong> on the date shown above (monthly or yearly).</li>
              <li>No manual payment each cycle — Stripe charges your card and sends a receipt by email.</li>
              <li>Cancel anytime from <strong className="text-slate-200">Manage billing</strong>; you keep access until the period ends.</li>
              <li>If a renewal fails, status becomes <strong className="text-slate-200">past due</strong> — update your card to avoid downgrade.</li>
            </ul>
          </div>
        </div>
      </div>

      <div className="text-center max-w-2xl mx-auto">
        <h1 className="text-4xl font-extrabold text-white mb-4">Simple, <span className="gradient-text">affordable</span> pricing</h1>
        <p className="text-slate-400">
          Honest prices with no hidden fees. Start free, upgrade when you need more — every paid plan renews automatically until you cancel.
        </p>

        <div className="flex items-center justify-center gap-4 mt-8">
          <span className={`text-sm ${billingCycle === 'monthly' ? 'text-white font-semibold' : 'text-slate-500'}`}>Monthly</span>
          <button
            type="button"
            onClick={() => setBillingCycle(billingCycle === 'monthly' ? 'yearly' : 'monthly')}
            className="w-12 h-6 rounded-full bg-white/5 border border-white/10 relative p-1 transition-colors"
            aria-label="Toggle billing cycle"
          >
            <motion.div
              animate={{ x: billingCycle === 'monthly' ? 0 : 24 }}
              className="w-4 h-4 rounded-full bg-primary-500 shadow-ai"
            />
          </button>
          <span className={`text-sm ${billingCycle === 'yearly' ? 'text-white font-semibold' : 'text-slate-500'}`}>
            Yearly <span className="text-emerald-400">(save ~10%)</span>
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {displayPlans.map((plan, i) => {
          const isCurrent = currentSub?.plan_id === plan.id;
          return (
            <motion.div
              key={plan.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08 }}
              className={`glass-card relative flex flex-col ${plan.popular ? 'border-primary-500/50 bg-primary-500/5 shadow-2xl shadow-primary-500/10' : ''} ${isCurrent ? 'ring-2 ring-emerald-500/50' : ''}`}
            >
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary-500 text-white text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-widest shadow-ai flex items-center gap-1">
                  <Sparkles size={10} /> Best value
                </div>
              )}

              <div className="mb-6">
                <h3 className="text-xl font-bold text-white mb-2">{plan.name}</h3>
                <div className="flex items-baseline gap-1 mb-2">
                  <span className="text-4xl font-extrabold text-white">{plan.priceLabel}</span>
                  <span className="text-slate-500 text-sm">{plan.periodLabel}</span>
                </div>
                <p className="text-xs text-primary-300/90 mb-2">{plan.billingNote}</p>
                <p className="text-slate-400 text-sm leading-relaxed">{plan.description}</p>
              </div>

              <div className="space-y-3 mb-8 flex-1">
                {plan.features.map((feature) => (
                  <div key={feature} className="flex items-start gap-3 text-sm text-slate-300">
                    <div className="mt-0.5 p-0.5 rounded-full bg-primary-500/10 text-primary-400">
                      <Check size={12} />
                    </div>
                    {feature}
                  </div>
                ))}
              </div>

              <Button
                variant={isCurrent ? 'secondary' : 'primary'}
                className="w-full"
                disabled={isCurrent || plan.isFree || subscribingId !== null}
                isLoading={subscribingId === plan.id}
                onClick={() => handleSubscribe(plan)}
              >
                {isCurrent ? 'Current plan' : plan.isFree ? 'Included free' : `Subscribe · ${plan.priceLabel}${plan.periodLabel.includes('month') ? '' : '/mo'}`}
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
            <h4 className="text-xl font-bold text-white">Secure payments by Stripe</h4>
            <p className="text-slate-400 text-sm mt-1">
              PCI-DSS compliant. We never store your card — Stripe handles all recurring charges and invoices.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BillingPage;
