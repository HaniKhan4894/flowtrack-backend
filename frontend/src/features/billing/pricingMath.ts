export interface BillingSliderSettings {
  slider_min: number;
  slider_max: number;
  slider_step: number;
  slider_default: number;
  slider_marks: number[];
  yearly_discount_percent: number;
}

export const DEFAULT_BILLING_SETTINGS: BillingSliderSettings = {
  slider_min: 1,
  slider_max: 200,
  slider_step: 5,
  slider_default: 5,
  slider_marks: [1, 5, 25, 50, 100, 150, 200],
  yearly_discount_percent: 10,
};

export interface PlanTotals {
  userCount: number;
  perUserRate: number;
  teamMonthlyTotal: number;
  annualTotal: number;
}

export function normalizeBillingSettings(raw?: Partial<BillingSliderSettings> | null): BillingSliderSettings {
  if (!raw) {
    return DEFAULT_BILLING_SETTINGS;
  }

  const marks = Array.isArray(raw.slider_marks) && raw.slider_marks.length
    ? raw.slider_marks.map(Number).filter((n) => Number.isFinite(n))
    : DEFAULT_BILLING_SETTINGS.slider_marks;

  return {
    slider_min: Number(raw.slider_min ?? DEFAULT_BILLING_SETTINGS.slider_min),
    slider_max: Number(raw.slider_max ?? DEFAULT_BILLING_SETTINGS.slider_max),
    slider_step: Number(raw.slider_step ?? DEFAULT_BILLING_SETTINGS.slider_step),
    slider_default: Number(raw.slider_default ?? DEFAULT_BILLING_SETTINGS.slider_default),
    slider_marks: marks,
    yearly_discount_percent: Number(raw.yearly_discount_percent ?? DEFAULT_BILLING_SETTINGS.yearly_discount_percent),
  };
}

/** Valid stops: 1, then 5, 10, 15, … up to slider_max */
export function buildSliderStops(settings: BillingSliderSettings): number[] {
  const min = Math.max(1, settings.slider_min);
  const max = Math.max(min, settings.slider_max);
  const step = Math.max(1, settings.slider_step);

  const stops: number[] = [min];
  for (let v = step; v <= max; v += step) {
    if (!stops.includes(v)) {
      stops.push(v);
    }
  }

  return stops;
}

export function snapSliderUsers(value: number, settings: BillingSliderSettings): number {
  const stops = buildSliderStops(settings);
  const target = Math.min(settings.slider_max, Math.max(settings.slider_min, Math.round(value)));

  let nearest = stops[0];
  let nearestDist = Math.abs(target - nearest);
  for (const stop of stops) {
    const dist = Math.abs(target - stop);
    if (dist < nearestDist) {
      nearest = stop;
      nearestDist = dist;
    }
  }

  return nearest;
}

/** @deprecated use snapSliderUsers */
export function clampSliderUsers(value: number, settings: BillingSliderSettings): number {
  return snapSliderUsers(value, settings);
}

export function userCountToSliderIndex(userCount: number, settings: BillingSliderSettings): number {
  const stops = buildSliderStops(settings);
  const snapped = snapSliderUsers(userCount, settings);
  const idx = stops.indexOf(snapped);
  return idx >= 0 ? idx : 0;
}

export function sliderIndexToUserCount(index: number, settings: BillingSliderSettings): number {
  const stops = buildSliderStops(settings);
  const idx = Math.min(stops.length - 1, Math.max(0, Math.round(index)));
  return stops[idx];
}

export function yearlyDiscountRate(settings: BillingSliderSettings): number {
  return Math.max(0, settings.yearly_discount_percent) / 100;
}

export function calcPlanTotals(
  basePrice: number,
  perUser: number,
  userCount: number,
  billingCycle: 'monthly' | 'yearly',
  settings: BillingSliderSettings = DEFAULT_BILLING_SETTINGS,
): PlanTotals {
  const users = Math.max(1, userCount);
  const rawMonthly = basePrice + perUser * users;
  const discount = yearlyDiscountRate(settings);
  const perUserRate = billingCycle === 'yearly' ? perUser * (1 - discount) : perUser;
  const teamMonthlyTotal = billingCycle === 'yearly' ? rawMonthly * (1 - discount) : rawMonthly;
  const annualTotal = rawMonthly * 12 * (1 - (billingCycle === 'yearly' ? discount : 0));

  return { userCount: users, perUserRate, teamMonthlyTotal, annualTotal };
}

export function formatMoney(amount: number, decimals = 2): string {
  return `$${amount.toFixed(decimals)}`;
}
