import { calcPlanTotals, formatMoney, type BillingSliderSettings, DEFAULT_BILLING_SETTINGS } from './pricingMath';

export interface ApiPlanFeature {
  feature_key?: string;
  feature_value?: string;
  display_name?: string;
  is_enabled?: boolean | number;
  show_on_pricing?: boolean | number;
  sort_order?: number;
}

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
  max_users?: number | null;
  trial_days?: number;
  is_popular?: boolean | number;
  features?: ApiPlanFeature[];
}

export interface DisplayPlan {
  id: number;
  slug: string;
  name: string;
  priceLabel: string;
  periodLabel: string;
  teamTotalLabel?: string;
  annualTotalLabel?: string;
  billingNote: string;
  trialHint?: string;
  description: string;
  features: string[];
  popular: boolean;
  isFree: boolean;
  trialDays: number;
  maxUsers: number | null;
  disabled: boolean;
  disabledReason?: string;
}

export interface FormatPlanOptions {
  billableUsers?: number;
  billingSettings?: BillingSliderSettings;
}

export function isPopularFlag(value: unknown): boolean {
  return value === true || value === 1 || value === '1';
}

export function getPlanMaxUsers(plan: ApiPlan): number | null {
  if (plan.max_users != null && plan.max_users !== undefined && Number(plan.max_users) > 0) {
    return Number(plan.max_users);
  }

  if (plan.slug === 'free') {
    return 1;
  }

  const row = plan.features?.find((f) => f.feature_key === 'max_users');
  const value = row?.feature_value?.trim().toLowerCase();
  if (!value || value === 'unlimited') {
    return null;
  }

  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export function getPlanEligibility(
  plan: ApiPlan,
  previewUsers: number,
  billableUsers?: number,
): { disabled: boolean; disabledReason?: string; effectiveUsers: number } {
  const max = getPlanMaxUsers(plan);
  const effectiveUsers = billableUsers != null
    ? Math.max(previewUsers, billableUsers)
    : previewUsers;

  if (max !== null && effectiveUsers > max) {
    const reason = max === 1
      ? 'For 1 user only'
      : `Supports up to ${max} users`;
    return { disabled: true, disabledReason: reason, effectiveUsers };
  }

  return { disabled: false, effectiveUsers };
}

export function formatPlanForDisplay(
  plan: ApiPlan,
  billingCycle: 'monthly' | 'yearly',
  userCount = 5,
  options?: FormatPlanOptions,
): DisplayPlan {
  const settings = options?.billingSettings ?? DEFAULT_BILLING_SETTINGS;
  const isFree = plan.slug === 'free'
    || ((plan.pricing_model === 'per_user')
      ? Number(plan.base_price ?? 0) <= 0 && Number(plan.price_per_user ?? 0) <= 0
      : Number(plan.price_monthly) <= 0 && Number(plan.price_yearly) <= 0);
  const trialDays = Number(plan.trial_days ?? 0);
  const maxUsers = getPlanMaxUsers(plan);
  const { disabled, disabledReason, effectiveUsers } = getPlanEligibility(
    plan,
    userCount,
    options?.billableUsers,
  );

  if (isFree) {
    return {
      id: plan.id,
      slug: plan.slug,
      name: plan.name,
      priceLabel: '$0',
      periodLabel: 'forever',
      billingNote: 'No credit card required',
      description: plan.description || 'Try FlowTrack at no cost',
      features: pickPricingFeatureLabels(plan),
      popular: false,
      isFree: true,
      trialDays: 0,
      maxUsers,
      disabled,
      disabledReason,
    };
  }

  if (plan.pricing_model === 'per_user') {
    const base = Number(plan.base_price ?? 0);
    const perUser = Number(plan.price_per_user ?? 0);
    const minUsers = Number(plan.min_users ?? 1);
    const users = Math.max(minUsers, effectiveUsers);
    const totals = calcPlanTotals(base, perUser, users, billingCycle, settings);
    const trialHint = trialDays > 0 ? 'Cancel anytime before you\'re charged.' : undefined;

    const priceBreakdown = base > 0
      ? billingCycle === 'yearly'
        ? `${formatMoney(base)}/mo base + ${formatMoney(perUser)}/user · billed yearly`
        : `${formatMoney(base)}/mo base + ${formatMoney(perUser)}/user`
      : billingCycle === 'yearly'
        ? `Billed annually · save ${settings.yearly_discount_percent}%`
        : 'Billed monthly';

    return {
      id: plan.id,
      slug: plan.slug,
      name: plan.name,
      priceLabel: formatMoney(totals.perUserRate),
      periodLabel: '/user/month',
      teamTotalLabel: `${formatMoney(totals.teamMonthlyTotal)} for ${users} user${users === 1 ? '' : 's'}/month`,
      annualTotalLabel: billingCycle === 'yearly'
        ? `${formatMoney(totals.annualTotal, 0)} annually`
        : undefined,
      billingNote: priceBreakdown,
      trialHint,
      description: plan.description || '',
      features: pickPricingFeatureLabels(plan),
      popular: isPopularFlag(plan.is_popular),
      isFree: false,
      trialDays,
      maxUsers,
      disabled,
      disabledReason,
    };
  }

  const monthly = Number(plan.price_monthly ?? 0);
  const discount = settings.yearly_discount_percent / 100;
  const yearlyTotal = Number(plan.price_yearly ?? monthly * 12 * (1 - discount));
  const displayAmount = billingCycle === 'yearly' ? yearlyTotal / 12 : monthly;

  return {
    id: plan.id,
    slug: plan.slug,
    name: plan.name,
    priceLabel: formatMoney(displayAmount),
    periodLabel: billingCycle === 'yearly' ? '/month (billed yearly)' : '/month',
    billingNote: billingCycle === 'yearly'
      ? `${formatMoney(yearlyTotal)} charged once per year`
      : trialDays > 0
        ? `${formatMoney(monthly)}/mo after trial`
        : `${formatMoney(monthly)}/mo`,
    trialHint: trialDays > 0 ? 'Cancel anytime before you\'re charged.' : undefined,
    description: plan.description || '',
    features: pickPricingFeatureLabels(plan),
    popular: isPopularFlag(plan.is_popular),
    isFree: false,
    trialDays,
    maxUsers,
    disabled,
    disabledReason,
  };
}

function pickPricingFeatureLabels(plan: ApiPlan): string[] {
  const maxLabel = formatMaxUsersFeatureLabel(plan.max_users);

  const rows = (plan.features ?? [])
    .filter((f) => f.show_on_pricing !== 0 && f.show_on_pricing !== false && f.is_enabled !== 0 && f.is_enabled !== false)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

  const labels = rows
    .map((f) => {
      if (f.feature_key === 'max_users' && maxLabel) {
        return maxLabel;
      }
      return f.display_name || humanizeFeature(f.feature_key, f.feature_value);
    })
    .filter(Boolean);

  return labels.slice(0, 10);
}

function formatMaxUsersFeatureLabel(maxUsers?: number | null): string {
  if (maxUsers == null) {
    return 'Unlimited team members';
  }
  const max = Number(maxUsers);
  if (max === 1) return 'Single user only';
  if (max > 0) return `Up to ${max} team members`;
  return '';
}

function humanizeFeature(key?: string, value?: string): string {
  if (!key) return '';
  if (value === 'true') return key.replace(/_/g, ' ');
  if (value === 'false') return '';
  return `${key.replace(/_/g, ' ')}: ${value}`;
}
