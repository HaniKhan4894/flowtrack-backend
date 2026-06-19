export interface ApiPlan {
  id: number;
  name: string;
  slug: string;
  description?: string;
  pricing_model?: string;
  price_monthly?: number;
  price_yearly?: number;
  base_price?: number;
  price_per_user?: number;
  min_users?: number;
  trial_days?: number;
  is_popular?: boolean | number;
  features?: Array<{ feature_key?: string; feature_value?: string; display_name?: string }>;
}

export interface DisplayPlan {
  id: number;
  slug: string;
  name: string;
  priceLabel: string;
  periodLabel: string;
  billingNote: string;
  description: string;
  features: string[];
  popular: boolean;
  isFree: boolean;
  trialDays: number;
}

export function formatPlanForDisplay(plan: ApiPlan, billingCycle: 'monthly' | 'yearly'): DisplayPlan {
  const isFree = plan.slug === 'free' || (Number(plan.price_monthly) <= 0 && Number(plan.price_yearly) <= 0);
  const trialDays = Number(plan.trial_days ?? 0);

  if (isFree) {
    return {
      id: plan.id,
      slug: plan.slug,
      name: plan.name,
      priceLabel: '$0',
      periodLabel: 'forever',
      billingNote: 'No credit card required',
      description: plan.description || 'Try FlowTrack at no cost',
      features: pickFeatureLabels(plan),
      popular: false,
      isFree: true,
      trialDays: 0,
    };
  }

  if (plan.pricing_model === 'per_user') {
    const base = Number(plan.base_price ?? 0);
    const perUser = Number(plan.price_per_user ?? 0);
    const minUsers = Number(plan.min_users ?? 1);
    const exampleUsers = Math.max(minUsers, 3);
    const monthlyTotal = base + perUser * exampleUsers;
    const yearlyMonthlyEquiv = billingCycle === 'yearly'
      ? (monthlyTotal * 12 * 0.9) / 12
      : monthlyTotal;

    return {
      id: plan.id,
      slug: plan.slug,
      name: plan.name,
      priceLabel: `$${yearlyMonthlyEquiv.toFixed(2)}`,
      periodLabel: `/month (${exampleUsers} users example)`,
      billingNote: billingCycle === 'yearly'
        ? `Billed yearly · $${base}/mo base + $${perUser}/user · auto-renews`
        : `$${base}/mo base + $${perUser}/user · auto-renews monthly`,
      description: plan.description || '',
      features: pickFeatureLabels(plan),
      popular: !!plan.is_popular,
      isFree: false,
      trialDays,
    };
  }

  const monthly = Number(plan.price_monthly ?? 0);
  const yearlyTotal = Number(plan.price_yearly ?? monthly * 12 * 0.9);
  const displayAmount = billingCycle === 'yearly' ? yearlyTotal / 12 : monthly;

  return {
    id: plan.id,
    slug: plan.slug,
    name: plan.name,
    priceLabel: `$${displayAmount.toFixed(2)}`,
    periodLabel: billingCycle === 'yearly' ? '/month (billed yearly)' : '/month',
    billingNote: billingCycle === 'yearly'
      ? `$${yearlyTotal.toFixed(2)} charged once per year · auto-renews`
      : trialDays > 0
        ? `${trialDays}-day free trial, then $${monthly.toFixed(2)}/mo auto-renews`
        : `$${monthly.toFixed(2)} charged automatically every month`,
    description: plan.description || '',
    features: pickFeatureLabels(plan),
    popular: !!plan.is_popular,
    isFree: false,
    trialDays,
  };
}

function pickFeatureLabels(plan: ApiPlan): string[] {
  const rows = plan.features ?? [];
  const labels = rows
    .map((f) => f.display_name || humanizeFeature(f.feature_key, f.feature_value))
    .filter(Boolean);
  return labels.slice(0, 6);
}

function humanizeFeature(key?: string, value?: string): string {
  if (!key) return '';
  if (value === 'true') return key.replace(/_/g, ' ');
  if (value === 'false') return '';
  return `${key.replace(/_/g, ' ')}: ${value}`;
}
