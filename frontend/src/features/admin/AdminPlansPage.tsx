import { useCallback, useEffect, useState } from 'react';
import { Check, Layers, Pencil, Plus, Settings2, Sliders, Trash2, X } from 'lucide-react';
import { adminService } from '../../api/adminService';
import { getApiErrorMessage } from '../../utils/apiError';
import { toastError, toastSuccess } from '../../store/toastStore';
import type { AdminPlan, AdminPlanFeature, BillingSettings } from '../../types/admin';
import { Badge, Button, Card, Modal, PageSkeleton } from '../../components/ui';
import { ConfirmDialog } from './components/AdminUI';
import { formatCurrency, formatNumber } from './components/format';

interface PlanForm {
  name: string;
  slug: string;
  description: string;
  pricing_model: 'fixed' | 'per_user';
  price_monthly: string;
  price_yearly: string;
  base_price: string;
  price_per_user: string;
  min_users: string;
  max_users: string;
  trial_days: string;
  sort_order: string;
  is_active: boolean;
  is_popular: boolean;
  stripe_price_id_monthly: string;
  stripe_price_id_yearly: string;
}

const emptyPlanForm: PlanForm = {
  name: '',
  slug: '',
  description: '',
  pricing_model: 'fixed',
  price_monthly: '0',
  price_yearly: '0',
  base_price: '0',
  price_per_user: '0',
  min_users: '1',
  max_users: '',
  trial_days: '14',
  sort_order: '0',
  is_active: true,
  is_popular: false,
  stripe_price_id_monthly: '',
  stripe_price_id_yearly: '',
};

const toForm = (plan: AdminPlan): PlanForm => ({
  name: plan.name,
  slug: plan.slug,
  description: plan.description ?? '',
  pricing_model: plan.pricing_model,
  price_monthly: String(plan.price_monthly),
  price_yearly: String(plan.price_yearly),
  base_price: String(plan.base_price),
  price_per_user: String(plan.price_per_user),
  min_users: String(plan.min_users),
  max_users: plan.max_users === null ? '' : String(plan.max_users),
  trial_days: String(plan.trial_days),
  sort_order: String(plan.sort_order),
  is_active: plan.is_active,
  is_popular: plan.is_popular,
  stripe_price_id_monthly: plan.stripe_price_id_monthly ?? '',
  stripe_price_id_yearly: plan.stripe_price_id_yearly ?? '',
});

const TextField = ({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  hint?: string;
}) => (
  <label className="block space-y-1.5">
    <span className="text-xs font-medium text-slate-400">{label}</span>
    <input
      type={type}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-primary-500/50"
    />
    {hint && <span className="text-[11px] text-slate-500 block">{hint}</span>}
  </label>
);

const ToggleField = ({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) => (
  <button
    type="button"
    onClick={() => onChange(!checked)}
    className={
      checked
        ? 'inline-flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/15 px-3 py-2.5 text-sm font-medium text-emerald-300'
        : 'inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-slate-400 hover:text-white'
    }
  >
    {checked ? <Check size={14} /> : <X size={14} />}
    {label}
  </button>
);

const AdminPlansPage = () => {
  const [plans, setPlans] = useState<AdminPlan[]>([]);
  const [featureKeys, setFeatureKeys] = useState<Record<string, string>>({});
  const [billing, setBilling] = useState<BillingSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [planModal, setPlanModal] = useState<{ mode: 'create' | 'edit'; plan?: AdminPlan } | null>(null);
  const [planForm, setPlanForm] = useState<PlanForm>(emptyPlanForm);
  const [featureModal, setFeatureModal] = useState<{ plan: AdminPlan; feature?: AdminPlanFeature } | null>(null);
  const [featureForm, setFeatureForm] = useState({
    feature_key: '',
    display_name: '',
    feature_value: 'true',
    is_enabled: true,
    show_on_pricing: true,
    sort_order: '0',
  });
  const [billingModal, setBillingModal] = useState(false);
  const [billingForm, setBillingForm] = useState({
    slider_min: '1',
    slider_max: '100',
    slider_step: '1',
    slider_default: '5',
    slider_marks: '',
    yearly_discount_percent: '20',
  });
  const [deleting, setDeleting] = useState<AdminPlan | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await adminService.getPlans();
      setPlans(response.data.plans ?? []);
      setFeatureKeys(response.data.feature_keys ?? {});
      setBilling(response.data.billing_settings ?? null);
      const settings = response.data.billing_settings;
      if (settings) {
        setBillingForm({
          slider_min: String(settings.slider_min),
          slider_max: String(settings.slider_max),
          slider_step: String(settings.slider_step),
          slider_default: String(settings.slider_default),
          slider_marks: (settings.slider_marks ?? []).join(', '),
          yearly_discount_percent: String(settings.yearly_discount_percent),
        });
      }
    } catch (e) {
      setError(getApiErrorMessage(e, 'Could not load plans'));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const savePlan = async () => {
    setIsSubmitting(true);
    const payload = {
      ...planForm,
      is_active: planForm.is_active ? 1 : 0,
      is_popular: planForm.is_popular ? 1 : 0,
    };
    try {
      if (planModal?.mode === 'edit' && planModal.plan) {
        await adminService.updatePlan(planModal.plan.id, payload);
        toastSuccess('Plan updated');
      } else {
        await adminService.createPlan(payload);
        toastSuccess('Plan created');
      }
      setPlanModal(null);
      void load();
    } catch (e) {
      toastError(getApiErrorMessage(e, 'Could not save plan'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const saveFeature = async () => {
    if (!featureModal) return;
    setIsSubmitting(true);
    try {
      await adminService.upsertPlanFeature(featureModal.plan.id, {
        ...featureForm,
        is_enabled: featureForm.is_enabled ? 1 : 0,
        show_on_pricing: featureForm.show_on_pricing ? 1 : 0,
      });
      toastSuccess('Feature saved');
      setFeatureModal(null);
      void load();
    } catch (e) {
      toastError(getApiErrorMessage(e, 'Could not save feature'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleFeature = async (plan: AdminPlan, feature: AdminPlanFeature) => {
    try {
      await adminService.upsertPlanFeature(plan.id, {
        feature_key: feature.feature_key,
        display_name: feature.display_name,
        feature_value: feature.feature_value,
        sort_order: feature.sort_order,
        show_on_pricing: feature.show_on_pricing ? 1 : 0,
        is_enabled: feature.is_enabled ? 0 : 1,
      });
      void load();
    } catch (e) {
      toastError(getApiErrorMessage(e, 'Could not toggle feature'));
    }
  };

  const removeFeature = async (plan: AdminPlan, feature: AdminPlanFeature) => {
    try {
      await adminService.deletePlanFeature(plan.id, feature.id);
      toastSuccess('Feature removed');
      void load();
    } catch (e) {
      toastError(getApiErrorMessage(e, 'Could not remove feature'));
    }
  };

  const removePlan = async () => {
    if (!deleting) return;
    setIsSubmitting(true);
    try {
      await adminService.deletePlan(deleting.id);
      toastSuccess('Plan deleted');
      setDeleting(null);
      void load();
    } catch (e) {
      toastError(getApiErrorMessage(e, 'Could not delete plan'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const saveBilling = async () => {
    setIsSubmitting(true);
    try {
      const marks = billingForm.slider_marks
        .split(',')
        .map((mark) => Number(mark.trim()))
        .filter((mark) => Number.isFinite(mark) && mark > 0);

      await adminService.updateBillingSettings({
        slider_min: billingForm.slider_min,
        slider_max: billingForm.slider_max,
        slider_step: billingForm.slider_step,
        slider_default: billingForm.slider_default,
        yearly_discount_percent: billingForm.yearly_discount_percent,
        slider_marks: marks,
      });
      toastSuccess('Billing settings updated');
      setBillingModal(false);
      void load();
    } catch (e) {
      toastError(getApiErrorMessage(e, 'Could not update billing settings'));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) return <PageSkeleton />;
  if (error) return <p className="text-sm text-rose-300">{error}</p>;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-white">Plan catalogue</h2>
          <p className="text-sm text-slate-400">
            {plans.length} plans · pricing, seat limits, and feature flags that gate the product
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => setBillingModal(true)}>
            <Sliders size={14} className="mr-2" /> Pricing page settings
          </Button>
          <Button
            size="sm"
            onClick={() => {
              setPlanForm(emptyPlanForm);
              setPlanModal({ mode: 'create' });
            }}
          >
            <Plus size={14} className="mr-2" /> New plan
          </Button>
        </div>
      </div>

      {billing && (
        <Card className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <span className="inline-flex items-center gap-2 text-slate-300">
            <Settings2 size={15} className="text-primary-300" /> Seat slider
          </span>
          <span className="text-slate-400">
            {billing.slider_min}–{billing.slider_max} seats (step {billing.slider_step}, default {billing.slider_default})
          </span>
          <span className="text-slate-400">Yearly discount {billing.yearly_discount_percent}%</span>
          {billing.slider_marks?.length > 0 && (
            <span className="text-slate-500 text-xs">marks: {billing.slider_marks.join(', ')}</span>
          )}
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {plans.map((plan) => (
          <Card key={plan.id} padding="none" className="overflow-hidden">
            <div className="px-5 py-4 border-b border-white/10 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-base font-bold text-white truncate">{plan.name}</h3>
                  {plan.is_popular && <Badge variant="primary">Popular</Badge>}
                  {plan.is_active ? <Badge variant="success">Live</Badge> : <Badge variant="danger">Hidden</Badge>}
                  <Badge>{plan.pricing_model === 'per_user' ? 'per seat' : 'fixed'}</Badge>
                </div>
                <p className="text-xs text-slate-500 mt-1 truncate">{plan.description || plan.slug}</p>
              </div>
              <div className="flex gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setPlanForm(toForm(plan));
                    setPlanModal({ mode: 'edit', plan });
                  }}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10"
                  aria-label={`Edit ${plan.name}`}
                >
                  <Pencil size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => setDeleting(plan)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-300 hover:bg-rose-500/10"
                  aria-label={`Delete ${plan.name}`}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>

            <div className="px-5 py-4 grid grid-cols-2 sm:grid-cols-4 gap-3 border-b border-white/10">
              <div>
                <p className="text-[11px] uppercase tracking-wide text-slate-500">Monthly</p>
                <p className="text-sm font-semibold text-white">{formatCurrency(plan.price_monthly)}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-slate-500">Yearly</p>
                <p className="text-sm font-semibold text-white">{formatCurrency(plan.price_yearly)}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-slate-500">Seats</p>
                <p className="text-sm font-semibold text-white">
                  {plan.min_users}–{plan.max_users ?? '∞'}
                </p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-slate-500">Trial</p>
                <p className="text-sm font-semibold text-white">{plan.trial_days}d</p>
              </div>
            </div>

            <div className="px-5 py-3 border-b border-white/10 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-400">
              <span>
                <span className="text-slate-200 font-semibold">{formatNumber(plan.usage.active_accounts)}</span> active
              </span>
              <span>
                <span className="text-slate-200 font-semibold">{formatNumber(plan.usage.trial_accounts)}</span> trialling
              </span>
              <span>
                <span className="text-emerald-300 font-semibold">{formatCurrency(plan.usage.mrr)}</span> MRR
              </span>
              {plan.pricing_model === 'per_user' && (
                <span>
                  base {formatCurrency(plan.base_price)} + {formatCurrency(plan.price_per_user)}/seat
                </span>
              )}
            </div>

            <div className="px-5 py-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                  Feature flags ({plan.features.length})
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setFeatureForm({
                      feature_key: '',
                      display_name: '',
                      feature_value: 'true',
                      is_enabled: true,
                      show_on_pricing: true,
                      sort_order: String(plan.features.length),
                    });
                    setFeatureModal({ plan });
                  }}
                  className="inline-flex items-center gap-1 text-xs text-primary-300 hover:text-primary-200"
                >
                  <Plus size={12} /> Add feature
                </button>
              </div>

              {plan.features.length === 0 ? (
                <p className="text-xs text-slate-500">No feature flags. This plan gets platform defaults.</p>
              ) : (
                <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                  {plan.features.map((feature) => (
                    <div
                      key={feature.id}
                      className="flex items-center gap-2 rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2"
                    >
                      <button
                        type="button"
                        onClick={() => void toggleFeature(plan, feature)}
                        className={
                          feature.is_enabled
                            ? 'h-4 w-4 rounded border border-emerald-500/40 bg-emerald-500/25 text-emerald-300 flex items-center justify-center shrink-0'
                            : 'h-4 w-4 rounded border border-white/15 bg-white/5 shrink-0'
                        }
                        aria-label={feature.is_enabled ? 'Disable feature' : 'Enable feature'}
                      >
                        {feature.is_enabled && <Check size={11} />}
                      </button>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-slate-200 truncate">{feature.display_name}</p>
                        <p className="text-[11px] text-slate-500 font-mono truncate">
                          {feature.feature_key} = {feature.feature_value}
                        </p>
                      </div>
                      {feature.show_on_pricing && <Badge variant="info">pricing</Badge>}
                      <button
                        type="button"
                        onClick={() => {
                          setFeatureForm({
                            feature_key: feature.feature_key,
                            display_name: feature.display_name,
                            feature_value: feature.feature_value,
                            is_enabled: feature.is_enabled,
                            show_on_pricing: feature.show_on_pricing,
                            sort_order: String(feature.sort_order),
                          });
                          setFeatureModal({ plan, feature });
                        }}
                        className="p-1 rounded text-slate-500 hover:text-white shrink-0"
                        aria-label={`Edit ${feature.feature_key}`}
                      >
                        <Pencil size={12} />
                      </button>
                      <button
                        type="button"
                        onClick={() => void removeFeature(plan, feature)}
                        className="p-1 rounded text-slate-500 hover:text-rose-300 shrink-0"
                        aria-label={`Remove ${feature.feature_key}`}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>
        ))}

        {plans.length === 0 && (
          <Card className="text-center py-12">
            <Layers size={28} className="mx-auto text-slate-600 mb-3" />
            <p className="text-sm text-slate-400">No plans yet. Create your first plan to start selling.</p>
          </Card>
        )}
      </div>

      {/* Plan editor */}
      <Modal
        open={planModal !== null}
        onClose={() => setPlanModal(null)}
        title={planModal?.mode === 'edit' ? `Edit ${planModal.plan?.name}` : 'Create plan'}
        size="xl"
      >
        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <TextField label="Name" value={planForm.name} onChange={(v) => setPlanForm({ ...planForm, name: v })} placeholder="Pro" />
            <TextField
              label="Slug"
              value={planForm.slug}
              onChange={(v) => setPlanForm({ ...planForm, slug: v })}
              placeholder="pro"
              hint="Leave blank to generate from the name"
            />
          </div>

          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-slate-400">Description</span>
            <textarea
              value={planForm.description}
              onChange={(e) => setPlanForm({ ...planForm, description: e.target.value })}
              rows={2}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-primary-500/50"
              placeholder="For growing teams that need automation and integrations"
            />
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-slate-400">Pricing model</span>
              <select
                value={planForm.pricing_model}
                onChange={(e) => setPlanForm({ ...planForm, pricing_model: e.target.value as 'fixed' | 'per_user' })}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-primary-500/50"
              >
                <option value="fixed" className="bg-[#12141C]">Fixed price</option>
                <option value="per_user" className="bg-[#12141C]">Per seat</option>
              </select>
            </label>
            <TextField
              label="Monthly price"
              type="number"
              value={planForm.price_monthly}
              onChange={(v) => setPlanForm({ ...planForm, price_monthly: v })}
            />
            <TextField
              label="Yearly price"
              type="number"
              value={planForm.price_yearly}
              onChange={(v) => setPlanForm({ ...planForm, price_yearly: v })}
            />
          </div>

          {planForm.pricing_model === 'per_user' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <TextField
                label="Base price"
                type="number"
                value={planForm.base_price}
                onChange={(v) => setPlanForm({ ...planForm, base_price: v })}
              />
              <TextField
                label="Price per seat"
                type="number"
                value={planForm.price_per_user}
                onChange={(v) => setPlanForm({ ...planForm, price_per_user: v })}
              />
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <TextField
              label="Min seats"
              type="number"
              value={planForm.min_users}
              onChange={(v) => setPlanForm({ ...planForm, min_users: v })}
            />
            <TextField
              label="Max seats"
              type="number"
              value={planForm.max_users}
              onChange={(v) => setPlanForm({ ...planForm, max_users: v })}
              hint="Blank = unlimited"
            />
            <TextField
              label="Trial days"
              type="number"
              value={planForm.trial_days}
              onChange={(v) => setPlanForm({ ...planForm, trial_days: v })}
            />
            <TextField
              label="Sort order"
              type="number"
              value={planForm.sort_order}
              onChange={(v) => setPlanForm({ ...planForm, sort_order: v })}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <TextField
              label="Stripe price ID (monthly)"
              value={planForm.stripe_price_id_monthly}
              onChange={(v) => setPlanForm({ ...planForm, stripe_price_id_monthly: v })}
              placeholder="price_…"
            />
            <TextField
              label="Stripe price ID (yearly)"
              value={planForm.stripe_price_id_yearly}
              onChange={(v) => setPlanForm({ ...planForm, stripe_price_id_yearly: v })}
              placeholder="price_…"
            />
          </div>

          <div className="flex flex-wrap gap-3">
            <ToggleField
              label="Visible on pricing page"
              checked={planForm.is_active}
              onChange={(v) => setPlanForm({ ...planForm, is_active: v })}
            />
            <ToggleField
              label="Highlight as popular"
              checked={planForm.is_popular}
              onChange={(v) => setPlanForm({ ...planForm, is_popular: v })}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" size="sm" onClick={() => setPlanModal(null)}>
              Cancel
            </Button>
            <Button size="sm" isLoading={isSubmitting} onClick={() => void savePlan()}>
              {planModal?.mode === 'edit' ? 'Save plan' : 'Create plan'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Feature editor */}
      <Modal
        open={featureModal !== null}
        onClose={() => setFeatureModal(null)}
        title={featureModal?.feature ? 'Edit feature flag' : `Add feature to ${featureModal?.plan.name ?? ''}`}
        size="md"
      >
        <div className="space-y-4">
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-slate-400">Feature key</span>
            <input
              value={featureForm.feature_key}
              onChange={(e) => setFeatureForm({ ...featureForm, feature_key: e.target.value })}
              list="admin-feature-keys"
              placeholder="screenshots"
              disabled={Boolean(featureModal?.feature)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-primary-500/50 disabled:opacity-60 font-mono"
            />
            <datalist id="admin-feature-keys">
              {Object.entries(featureKeys).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </datalist>
          </label>

          <TextField
            label="Display name"
            value={featureForm.display_name}
            onChange={(v) => setFeatureForm({ ...featureForm, display_name: v })}
            placeholder="Automatic screenshots"
          />

          <TextField
            label="Value"
            value={featureForm.feature_value}
            onChange={(v) => setFeatureForm({ ...featureForm, feature_value: v })}
            hint="Use true/false for switches, or a number/string for limits (e.g. 10, unlimited)"
          />

          <TextField
            label="Sort order"
            type="number"
            value={featureForm.sort_order}
            onChange={(v) => setFeatureForm({ ...featureForm, sort_order: v })}
          />

          <div className="flex flex-wrap gap-3">
            <ToggleField
              label="Enabled"
              checked={featureForm.is_enabled}
              onChange={(v) => setFeatureForm({ ...featureForm, is_enabled: v })}
            />
            <ToggleField
              label="Show on pricing page"
              checked={featureForm.show_on_pricing}
              onChange={(v) => setFeatureForm({ ...featureForm, show_on_pricing: v })}
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setFeatureModal(null)}>
              Cancel
            </Button>
            <Button size="sm" isLoading={isSubmitting} onClick={() => void saveFeature()}>
              Save feature
            </Button>
          </div>
        </div>
      </Modal>

      {/* Billing settings */}
      <Modal open={billingModal} onClose={() => setBillingModal(false)} title="Pricing page settings" size="md">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <TextField
              label="Slider minimum seats"
              type="number"
              value={billingForm.slider_min}
              onChange={(v) => setBillingForm({ ...billingForm, slider_min: v })}
            />
            <TextField
              label="Slider maximum seats"
              type="number"
              value={billingForm.slider_max}
              onChange={(v) => setBillingForm({ ...billingForm, slider_max: v })}
            />
            <TextField
              label="Step"
              type="number"
              value={billingForm.slider_step}
              onChange={(v) => setBillingForm({ ...billingForm, slider_step: v })}
            />
            <TextField
              label="Default seats"
              type="number"
              value={billingForm.slider_default}
              onChange={(v) => setBillingForm({ ...billingForm, slider_default: v })}
            />
          </div>
          <TextField
            label="Slider marks"
            value={billingForm.slider_marks}
            onChange={(v) => setBillingForm({ ...billingForm, slider_marks: v })}
            hint="Comma separated seat counts, e.g. 1, 5, 10, 25, 50"
          />
          <TextField
            label="Yearly discount %"
            type="number"
            value={billingForm.yearly_discount_percent}
            onChange={(v) => setBillingForm({ ...billingForm, yearly_discount_percent: v })}
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setBillingModal(false)}>
              Cancel
            </Button>
            <Button size="sm" isLoading={isSubmitting} onClick={() => void saveBilling()}>
              Save settings
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={deleting !== null}
        title={`Delete ${deleting?.name ?? ''}?`}
        description="Plans with active or historical subscriptions cannot be deleted — deactivate them instead so existing customers keep billing."
        confirmLabel="Delete plan"
        destructive
        isLoading={isSubmitting}
        onConfirm={() => void removePlan()}
        onClose={() => setDeleting(null)}
      />
    </div>
  );
};

export default AdminPlansPage;
