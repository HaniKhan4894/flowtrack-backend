import { motion } from 'framer-motion';
import { Check, Lock, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '../../components/ui';
import type { DisplayPlan } from './billingPlanUtils';

interface PricingCardsProps {
  plans: DisplayPlan[];
  billingCycle: 'monthly' | 'yearly';
  currentPlanId?: number | null;
  onSubscribe?: (plan: DisplayPlan) => void;
  subscribingId?: number | null;
  showAnnualBadge?: boolean;
  getStartedHref?: string;
  mode?: 'billing' | 'marketing';
  /** When false, paid CTAs say Upgrade (org already used / is in a trial). */
  trialEligible?: boolean;
}

export function PricingCards({
  plans,
  billingCycle,
  currentPlanId,
  onSubscribe,
  subscribingId,
  showAnnualBadge = true,
  getStartedHref = '/register',
  mode = 'marketing',
  trialEligible = true,
}: PricingCardsProps) {
  const currentSortOrder = plans.find((p) => p.id === currentPlanId)?.sortOrder;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
      {plans.map((plan, i) => {
        const isCurrent = currentPlanId === plan.id;
        const isBilling = mode === 'billing';
        const isLocked = plan.disabled && !isCurrent;
        const isDowngrade =
          currentSortOrder != null && plan.sortOrder < currentSortOrder;

        return (
          <motion.div
            key={plan.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06 }}
            className={`glass-card relative flex flex-col h-full transition-opacity ${
              isLocked ? 'opacity-45 saturate-50' : ''
            } ${plan.popular && !isLocked ? 'border-primary-500/50 bg-primary-500/5 shadow-2xl shadow-primary-500/10' : ''} ${
              isCurrent ? 'ring-2 ring-emerald-500/50 opacity-100 saturate-100' : ''
            }`}
          >
            {plan.popular && !isLocked && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary-500 text-white text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-widest shadow-ai flex items-center gap-1 whitespace-nowrap">
                <Sparkles size={10} /> Most popular
              </div>
            )}

            {isLocked && (
              <div className="absolute top-3 right-3 text-slate-500" title={plan.disabledReason}>
                <Lock size={16} />
              </div>
            )}

            <div className="mb-5">
              <h3 className="text-xl font-bold text-white mb-3">{plan.name}</h3>

              {plan.isFree ? (
                <div className="flex items-baseline gap-1 mb-2">
                  <span className="text-4xl font-extrabold text-white">{plan.priceLabel}</span>
                  <span className="text-slate-500 text-sm">{plan.periodLabel}</span>
                </div>
              ) : (
                <>
                  <div className="flex items-baseline gap-1 flex-wrap">
                    <span className={`text-4xl font-extrabold ${isLocked ? 'text-slate-400' : 'text-white'}`}>
                      {plan.priceLabel}
                    </span>
                    <span className="text-slate-400 text-sm">{plan.periodLabel}</span>
                  </div>
                  {plan.teamTotalLabel && (
                    <p className={`text-sm mt-2 font-medium ${isLocked ? 'text-slate-500' : 'text-slate-300'}`}>
                      {plan.teamTotalLabel}
                    </p>
                  )}
                  {showAnnualBadge && billingCycle === 'yearly' && plan.annualTotalLabel && !isLocked && (
                    <span className="inline-block mt-2 text-xs font-bold px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                      {plan.annualTotalLabel}
                    </span>
                  )}
                </>
              )}

              {isLocked && plan.disabledReason && (
                <p className="text-xs text-rose-300/90 mt-2 font-medium">{plan.disabledReason}</p>
              )}

              <p className="text-xs text-primary-300/80 mt-2">{plan.billingNote}</p>
              {plan.trialHint && !isLocked && trialEligible && (
                <p className="text-[10px] text-slate-500 mt-1">{plan.trialHint}</p>
              )}
              {!trialEligible && !plan.isFree && !isLocked && !isCurrent && isBilling && (
                <p className="text-[10px] text-slate-500 mt-1">
                  Switches your current subscription — remaining trial days stay the same.
                </p>
              )}
            </div>

            <ul className="space-y-2.5 mb-6 flex-1">
              {plan.features.map((feature) => (
                <li key={feature} className={`flex items-start gap-2.5 text-sm ${isLocked ? 'text-slate-500' : 'text-slate-300'}`}>
                  <div className="mt-0.5 p-0.5 rounded-full bg-primary-500/10 text-primary-400 shrink-0">
                    <Check size={12} />
                  </div>
                  {feature}
                </li>
              ))}
            </ul>

            {isBilling && onSubscribe ? (
              <Button
                variant={isCurrent ? 'secondary' : 'primary'}
                className="w-full mt-auto"
                disabled={isCurrent || plan.isFree || subscribingId !== null || isLocked}
                isLoading={subscribingId === plan.id}
                onClick={() => onSubscribe(plan)}
              >
                {isCurrent
                  ? 'Current plan'
                  : isLocked
                    ? plan.disabledReason ?? 'Not available'
                    : plan.isFree
                      ? 'Included free'
                      : trialEligible && plan.trialDays > 0
                        ? `Start ${plan.trialDays}-day trial`
                        : isDowngrade
                          ? 'Downgrade'
                          : 'Upgrade'}
              </Button>
            ) : (
              <div className="mt-auto">
                {isLocked ? (
                  <Button className="w-full" variant="secondary" disabled>
                    {plan.disabledReason ?? 'Not available'}
                  </Button>
                ) : (
                  <Link to={plan.isFree ? getStartedHref : '/register'}>
                    <Button className="w-full" variant={plan.isFree ? 'secondary' : 'primary'}>
                      {plan.isFree ? 'Get Started free' : 'Start 14-day trial'}
                    </Button>
                  </Link>
                )}
                {!plan.isFree && !isLocked && (
                  <p className="text-[10px] text-center text-slate-500 mt-2">14-day free trial</p>
                )}
              </div>
            )}
          </motion.div>
        );
      })}
    </div>
  );
}
