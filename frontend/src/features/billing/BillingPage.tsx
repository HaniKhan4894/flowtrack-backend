import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, Loader2, PartyPopper, AlertTriangle, Calendar, CreditCard, RefreshCw, ExternalLink, Sparkles } from 'lucide-react';
import { Button } from '../../components/ui';
import { billingService, type Subscription } from '../../api/billingService';
import { useSearchParams } from 'react-router-dom';
import { formatApiDate } from '../../utils/date';
import { formatPlanForDisplay, type ApiPlan, type DisplayPlan } from './billingPlanUtils';
import { PricingSlider } from './PricingSlider';
import { PricingCards } from './PricingCards';
import {
  clampSliderUsers,
  DEFAULT_BILLING_SETTINGS,
  type BillingSliderSettings,
} from './pricingMath';

const BillingPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [currentSub, setCurrentSub] = useState<Subscription | null>(null);
  const [apiPlans, setApiPlans] = useState<ApiPlan[]>([]);
  const [sliderSettings, setSliderSettings] = useState<BillingSliderSettings>(DEFAULT_BILLING_SETTINGS);
  const [billableUsers, setBillableUsers] = useState<number | undefined>(undefined);
  const [sliderUsers, setSliderUsers] = useState(DEFAULT_BILLING_SETTINGS.slider_default);
  const [isLoading, setIsLoading] = useState(true);
  const [subscribingId, setSubscribingId] = useState<number | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchSubscription();
    Promise.all([
      billingService.getPlans(),
      billingService.getUsage().catch(() => null),
    ]).then(([plansRes, usageRes]) => {
      const settings = plansRes.billingSettings;
      setApiPlans(plansRes.data ?? []);
      setSliderSettings(settings);

      if (usageRes?.data) {
        const members = usageRes.data.users?.members ?? 0;
        const pending = usageRes.data.users?.pending_invites ?? 0;
        const count = Math.max(1, members + pending);
        setBillableUsers(count);
        setSliderUsers(clampSliderUsers(Math.max(settings.slider_default, count), settings));
      } else {
        setSliderUsers(settings.slider_default);
      }
    }).catch(() => setApiPlans([]));
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

  const displayPlans: DisplayPlan[] = apiPlans.map((p) =>
    formatPlanForDisplay(p, billingCycle, sliderUsers, { billableUsers, billingSettings: sliderSettings }),
  );

  const handleSubscribe = async (plan: DisplayPlan) => {
    if (plan.isFree || plan.id === currentSub?.plan_id || plan.disabled) return;

    setSubscribingId(plan.id);
    setError(null);
    try {
      // Already on Stripe (trial or paid) → in-place upgrade keeps remaining trial days.
      if (currentSub?.stripe_subscription_id) {
        await billingService.upgrade(plan.id);
        await fetchSubscription();
        setShowSuccess(true);
        setTimeout(() => setShowSuccess(false), 5000);
        return;
      }

      const resp = await billingService.createCheckoutSession(plan.id, billingCycle);
      const checkoutUrl = resp?.data?.url;
      if (!checkoutUrl) throw new Error('Checkout URL not returned');
      window.location.href = checkoutUrl;
    } catch (e: unknown) {
      console.error('Subscription failed', e);
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg || 'Could not start checkout. Please try again or contact support.');
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
  const trialEligible = currentSub?.trial_eligible !== false && !currentSub?.stripe_subscription_id;
  const successMessage = currentSub?.status === 'trial' || trialEligible
    ? (currentSub?.stripe_subscription_id
      ? 'Plan upgraded — your remaining trial days stay the same. First charge still happens when the trial ends.'
      : "You're all set! Your trial has started — billing begins after 14 days unless you cancel.")
    : 'Plan upgraded successfully.';

  return (
    <div className="space-y-12 pb-12">
      <AnimatePresence>
        {showSuccess && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-8 left-1/2 -translate-x-1/2 z-50 bg-emerald-500 text-white px-8 py-4 rounded-3xl shadow-ai flex items-center gap-3 max-w-xl"
          >
            <PartyPopper size={24} className="shrink-0" />
            <span className="font-bold">{successMessage}</span>
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

      {currentSub?.status === 'trial' && (
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 bg-primary-500/10 border border-primary-500/30 rounded-2xl px-6 py-4">
          <div className="flex items-start gap-4">
            <Sparkles className="text-primary-400 shrink-0 mt-0.5" size={22} />
            <div>
              <p className="font-bold text-primary-200">Free trial active</p>
              <p className="text-sm text-primary-100/80 mt-1">
                {currentSub.trial_ends_at
                  ? <>First charge on {formatApiDate(currentSub.trial_ends_at)}. Upgrade anytime — remaining trial days carry over. Cancel before then from Manage billing — no charge.</>
                  : <>Your card is on file. Cancel anytime from Manage billing before the trial ends — no charge.</>}
              </p>
            </div>
          </div>
          {hasPaidStripe && (
            <Button variant="secondary" size="sm" onClick={openBillingPortal} isLoading={portalLoading}>
              Cancel trial
            </Button>
          )}
        </div>
      )}

      {currentSub && currentSub.status !== 'past_due' && currentSub.status !== 'trial' && currentSub.cancel_at_period_end && (
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
                {currentSub.status === 'trial' && currentSub.trial_ends_at
                  ? <span className="text-primary-400">Trial ends {formatApiDate(currentSub.trial_ends_at)}</span>
                  : currentSub.cancel_at_period_end
                    ? <span className="text-amber-400">Ends {formatApiDate(currentSub.current_period_end)}</span>
                    : <>Next charge {formatApiDate(currentSub.current_period_end)}</>}
                {' · '}{currentSub.billing_cycle}
                {' · '}${Number(currentSub.amount).toFixed(2)}
                {currentSub.user_count ? ` · ${currentSub.user_count} user${currentSub.user_count === 1 ? '' : 's'}` : ''}
                {currentSub.stripe_subscription_id ? ' · via Stripe' : ''}
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
            <p className="font-bold text-white text-base">How billing works</p>
            <ul className="list-disc pl-5 space-y-1.5 text-slate-400">
              <li>First paid plan includes a <strong className="text-slate-200">one-time 14-day free trial</strong> — card on file, charged only after the trial ends.</li>
              <li>Upgrading mid-trial (e.g. Starter → Professional) <strong className="text-slate-200">keeps the same trial end date</strong> — you do not get a fresh 14 days.</li>
              <li>Pricing is <strong className="text-slate-200">per user</strong> — charged for actual members + pending invites after trial, not the slider preview.</li>
              <li>Slider shows estimated cost; checkout always uses your real team size ({billableUsers ?? '…'} user{billableUsers === 1 ? '' : 's'}).</li>
              <li>During trial, adding users updates your seat count for the <strong className="text-slate-200">first charge</strong> — no mid-trial invoice.</li>
              <li>After you&apos;re paid, adding users <strong className="text-slate-200">charges a prorated amount right away</strong> for the rest of the billing period. Removing users applies credit on the next invoice.</li>
              <li>Cancel anytime from <strong className="text-slate-200">Manage billing</strong> before the trial ends to avoid any charge.</li>
              <li>After trial, your plan <strong className="text-slate-200">renews automatically</strong> on the date shown above.</li>
              <li>If a renewal fails, status becomes <strong className="text-slate-200">past due</strong> — update your card to avoid downgrade.</li>
            </ul>
          </div>
        </div>
      </div>

      <div className="text-center max-w-2xl mx-auto">
        <h1 className="text-4xl font-extrabold text-white mb-4">Simple, <span className="gradient-text">affordable</span> pricing</h1>
        <p className="text-slate-400">
          Per-user pricing below competitors. Drag the slider to preview your team cost
          {trialEligible ? ' — 14-day trial on your first paid plan.' : ' — upgrades keep your current billing / trial window.'}
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
            Yearly <span className="text-emerald-400">(save 10%)</span>
          </span>
        </div>
      </div>

      <div className="glass-card p-6 md:p-8 max-w-3xl mx-auto">
        <PricingSlider
          userCount={sliderUsers}
          settings={sliderSettings}
          onChange={(n) => setSliderUsers(clampSliderUsers(n, sliderSettings))}
        />
        {billableUsers !== undefined && (
          <p className="text-xs text-slate-500 mt-4 text-center">
            Your org: <strong className="text-slate-300">{billableUsers} billable user{billableUsers === 1 ? '' : 's'}</strong>
            {' '}(members + pending invites) — this is what you pay after trial.
          </p>
        )}
      </div>

      {displayPlans.length > 0 ? (
        <PricingCards
          plans={displayPlans}
          billingCycle={billingCycle}
          currentPlanId={currentSub?.plan_id}
          onSubscribe={handleSubscribe}
          subscribingId={subscribingId}
          mode="billing"
          trialEligible={trialEligible}
        />
      ) : (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 text-primary-500 animate-spin" />
        </div>
      )}

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
