import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { billingService } from '../../api/billingService';
import { formatPlanForDisplay, type ApiPlan } from './billingPlanUtils';
import { PricingSlider } from './PricingSlider';
import { PricingCards } from './PricingCards';
import {
  clampSliderUsers,
  DEFAULT_BILLING_SETTINGS,
  type BillingSliderSettings,
} from './pricingMath';

interface PricingSectionProps {
  badge?: string;
  title?: string;
  description?: string;
}

export function PricingSection({
  badge = 'Pricing',
  title = 'Packages built for every stage',
  description = 'Drag the slider to preview your team cost. Lower plans grey out when your team exceeds their seat limit.',
}: PricingSectionProps) {
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('yearly');
  const [sliderSettings, setSliderSettings] = useState<BillingSliderSettings>(DEFAULT_BILLING_SETTINGS);
  const [userCount, setUserCount] = useState(DEFAULT_BILLING_SETTINGS.slider_default);
  const [apiPlans, setApiPlans] = useState<ApiPlan[]>([]);

  useEffect(() => {
    billingService.getPlans()
      .then((r) => {
        setApiPlans(r.data ?? []);
        setSliderSettings(r.billingSettings);
        setUserCount(r.billingSettings.slider_default);
      })
      .catch(() => setApiPlans([]));
  }, []);

  const displayPlans = apiPlans.map((p) =>
    formatPlanForDisplay(p, billingCycle, userCount, { billingSettings: sliderSettings }),
  );

  const discountLabel = sliderSettings.yearly_discount_percent;

  return (
    <section id="pricing" className="max-w-7xl mx-auto px-6 py-14 relative z-10 scroll-mt-24">
      <div className="text-center mb-10">
        <span className="inline-block text-[10px] uppercase tracking-widest font-bold text-primary-400 mb-3">{badge}</span>
        <h2 className="text-3xl md:text-4xl font-extrabold text-white mb-3">{title}</h2>
        <p className="text-slate-400 max-w-2xl mx-auto">{description}</p>
      </div>

      <div className="glass-card p-6 md:p-8 mb-8 max-w-3xl mx-auto space-y-6">
        <PricingSlider
          userCount={userCount}
          settings={sliderSettings}
          onChange={(n) => setUserCount(clampSliderUsers(n, sliderSettings))}
        />

        <div className="flex items-center justify-center gap-4 pt-2 border-t border-white/10">
          <span className={`text-sm ${billingCycle === 'monthly' ? 'text-white font-semibold' : 'text-slate-500'}`}>
            Monthly billing
          </span>
          <button
            type="button"
            onClick={() => setBillingCycle(billingCycle === 'monthly' ? 'yearly' : 'monthly')}
            className="w-12 h-6 rounded-full bg-white/5 border border-white/10 relative p-1"
            aria-label="Toggle billing cycle"
          >
            <motion.div
              animate={{ x: billingCycle === 'monthly' ? 0 : 24 }}
              className="w-4 h-4 rounded-full bg-primary-500 shadow-ai"
            />
          </button>
          <span className={`text-sm ${billingCycle === 'yearly' ? 'text-white font-semibold' : 'text-slate-500'}`}>
            Annual billing <span className="text-emerald-400">(save {discountLabel}%)</span>
          </span>
        </div>
      </div>

      {displayPlans.length > 0 ? (
        <PricingCards plans={displayPlans} billingCycle={billingCycle} mode="marketing" />
      ) : (
        <p className="text-center text-slate-500">Loading plans…</p>
      )}

      <p className="text-center text-xs text-slate-500 mt-8 max-w-xl mx-auto">
        Per-user pricing. All paid tiers include a 14-day free trial.
      </p>
    </section>
  );
}
