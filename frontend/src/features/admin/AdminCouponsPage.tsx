import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, BadgePercent, Gift, Plus, RefreshCw, Tag, Trash2, TrendingUp } from 'lucide-react';
import { growthService } from '../../api/growthService';
import { adminService } from '../../api/adminService';
import { getApiErrorMessage } from '../../utils/apiError';
import { toastError, toastSuccess } from '../../store/toastStore';
import type { Coupon, CouponDetail, CouponSummary } from '../../types/growth';
import { toPagination } from '../../types/growth';
import type { AdminPlan, Pagination } from '../../types/admin';
import { Badge, Button, Card, Input, Modal } from '../../components/ui';
import {
  ConfirmDialog,
  DataTable,
  FilterBar,
  PaginationBar,
  Panel,
  SearchInput,
  SelectFilter,
  StatCard,
} from './components/AdminUI';
import { formatCurrency, formatDate, formatNumber, useDebounced } from './components/format';

const PURPOSE_OPTIONS = [
  { value: 'winback', label: 'Win-back (churned customers)' },
  { value: 'acquisition', label: 'Acquisition (new customers)' },
  { value: 'retention', label: 'Retention (keep existing)' },
  { value: 'upgrade', label: 'Upgrade / expansion' },
  { value: 'other', label: 'Other' },
];

const STATUS_OPTIONS = [
  { value: '', label: 'All coupons' },
  { value: 'active', label: 'Active' },
  { value: 'expired', label: 'Expired' },
  { value: 'disabled', label: 'Disabled' },
];

const DURATION_OPTIONS = [
  { value: 'once', label: 'First invoice only' },
  { value: 'repeating', label: 'For a number of months' },
  { value: 'forever', label: 'Forever' },
];

const stateVariant = (state: Coupon['state']) =>
  state === 'active' ? 'success' : state === 'expired' ? 'danger' : state === 'exhausted' ? 'warning' : 'default';

interface CouponForm {
  code: string;
  name: string;
  description: string;
  discount_type: 'percent' | 'amount';
  percent_off: string;
  amount_off: string;
  currency: string;
  duration: 'once' | 'repeating' | 'forever';
  duration_in_months: string;
  max_redemptions: string;
  expires_at: string;
  purpose: string;
  plan_ids: number[];
}

const emptyForm = (): CouponForm => ({
  code: '',
  name: '',
  description: '',
  discount_type: 'percent',
  percent_off: '20',
  amount_off: '',
  currency: 'usd',
  duration: 'once',
  duration_in_months: '3',
  max_redemptions: '',
  expires_at: '',
  purpose: 'winback',
  plan_ids: [],
});

const AdminCouponsPage = () => {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [summary, setSummary] = useState<CouponSummary | null>(null);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [plans, setPlans] = useState<AdminPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebounced(search);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Coupon | null>(null);
  const [form, setForm] = useState<CouponForm>(emptyForm());
  const [saving, setSaving] = useState(false);

  const [detail, setDetail] = useState<CouponDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Coupon | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await growthService.getCoupons({ search: debouncedSearch, status, page, per_page: 25 });
      setCoupons(response.data.coupons.data ?? []);
      setPagination(toPagination(response.data.coupons.meta));
      setSummary(response.data.summary);
    } catch (e) {
      setError(getApiErrorMessage(e, 'Could not load coupons'));
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, status, page]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void (async () => {
      try {
        const response = await adminService.getPlans();
        setPlans(response.data.plans ?? []);
      } catch {
        // Plan restriction is optional — the editor still works without the list.
      }
    })();
  }, []);

  const openEditor = (coupon: Coupon | null) => {
    setEditing(coupon);
    if (coupon) {
      setForm({
        code: coupon.code,
        name: coupon.name,
        description: coupon.description ?? '',
        discount_type: coupon.discount_type,
        percent_off: coupon.percent_off ? String(coupon.percent_off) : '',
        amount_off: coupon.amount_off ? String(coupon.amount_off) : '',
        currency: coupon.currency,
        duration: coupon.duration,
        duration_in_months: coupon.duration_in_months ? String(coupon.duration_in_months) : '3',
        max_redemptions: coupon.max_redemptions ? String(coupon.max_redemptions) : '',
        expires_at: coupon.expires_at ? coupon.expires_at.slice(0, 10) : '',
        purpose: coupon.purpose,
        plan_ids: coupon.plan_ids ?? [],
      });
    } else {
      setForm(emptyForm());
    }
    setEditorOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        name: form.name || form.code,
        description: form.description || null,
        purpose: form.purpose,
        max_redemptions: form.max_redemptions ? Number(form.max_redemptions) : 0,
        expires_at: form.expires_at || null,
        plan_ids: form.plan_ids,
      };

      if (editing) {
        await growthService.updateCoupon(editing.id, payload);
        toastSuccess('Coupon updated');
      } else {
        await growthService.createCoupon({
          ...payload,
          code: form.code,
          discount_type: form.discount_type,
          percent_off: form.discount_type === 'percent' ? Number(form.percent_off) : undefined,
          amount_off: form.discount_type === 'amount' ? Number(form.amount_off) : undefined,
          currency: form.currency,
          duration: form.duration,
          duration_in_months: form.duration === 'repeating' ? Number(form.duration_in_months) : undefined,
          is_active: 1,
        });
        toastSuccess('Coupon created and synced to Stripe');
      }
      setEditorOpen(false);
      await load();
    } catch (e) {
      toastError(getApiErrorMessage(e, 'Could not save the coupon'));
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (coupon: Coupon) => {
    try {
      await growthService.updateCoupon(coupon.id, { is_active: coupon.is_active ? 0 : 1 });
      toastSuccess(coupon.is_active ? 'Coupon disabled' : 'Coupon enabled');
      await load();
    } catch (e) {
      toastError(getApiErrorMessage(e, 'Could not update the coupon'));
    }
  };

  const handleResync = async (coupon: Coupon) => {
    try {
      await growthService.resyncCoupon(coupon.id);
      toastSuccess('Re-synced with Stripe');
      await load();
    } catch (e) {
      toastError(getApiErrorMessage(e, 'Stripe sync failed'));
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      await growthService.deleteCoupon(deleteTarget.id);
      toastSuccess('Coupon deleted');
      setDeleteTarget(null);
      await load();
    } catch (e) {
      toastError(getApiErrorMessage(e, 'Could not delete the coupon'));
    } finally {
      setBusy(false);
    }
  };

  const openDetail = async (coupon: Coupon) => {
    setDetailLoading(true);
    setDetail(null);
    try {
      const response = await growthService.getCoupon(coupon.id);
      setDetail(response.data);
    } catch (e) {
      toastError(getApiErrorMessage(e, 'Could not load redemptions'));
    } finally {
      setDetailLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          icon={Tag}
          label="Active coupons"
          value={formatNumber(summary?.active ?? 0)}
          hint={`${formatNumber(summary?.total ?? 0)} total`}
        />
        <StatCard
          icon={Gift}
          label="Redemptions"
          value={formatNumber(summary?.redemptions ?? 0)}
          hint={`${formatCurrency(summary?.total_discounted ?? 0)} discounted`}
        />
        <StatCard
          icon={BadgePercent}
          label="Discount given (30d)"
          value={formatCurrency(summary?.discounted_30d ?? 0)}
          hint="Cost of your offers"
          tone="warning"
        />
        <StatCard
          icon={TrendingUp}
          label="Revenue after redemption"
          value={formatCurrency(summary?.revenue_after_redemption ?? 0)}
          hint="Collected from accounts that used a coupon"
          tone="positive"
        />
      </div>

      <Panel
        title="Coupons & offers"
        description="Codes are created in Stripe as promotion codes, so they apply automatically at checkout."
        action={
          <Button size="sm" onClick={() => openEditor(null)}>
            <Plus size={14} />
            New coupon
          </Button>
        }
      >
        <FilterBar>
          <SearchInput value={search} onChange={setSearch} placeholder="Search code or name…" />
          <SelectFilter value={status} onChange={setStatus} options={STATUS_OPTIONS} label="Status" />
        </FilterBar>

        {error ? (
          <p className="text-sm text-rose-300 py-6 text-center">{error}</p>
        ) : (
          <>
            <DataTable
              columns={[
                {
                  key: 'code',
                  header: 'Code',
                  render: (row: Coupon) => (
                    <div className="min-w-0">
                      <button
                        type="button"
                        onClick={() => void openDetail(row)}
                        className="font-mono font-semibold text-white hover:text-primary-300"
                      >
                        {row.code}
                      </button>
                      <p className="text-xs text-slate-500 truncate">{row.name}</p>
                      {!row.stripe_synced && (
                        <p className="text-[11px] text-amber-300 flex items-center gap-1 mt-0.5">
                          <AlertTriangle size={11} />
                          Not synced to Stripe
                        </p>
                      )}
                    </div>
                  ),
                },
                {
                  key: 'discount',
                  header: 'Discount',
                  render: (row: Coupon) => <span className="text-slate-200">{row.discount_label}</span>,
                },
                {
                  key: 'purpose',
                  header: 'Purpose',
                  render: (row: Coupon) => (
                    <span className="text-xs text-slate-400 capitalize">{row.purpose}</span>
                  ),
                },
                {
                  key: 'usage',
                  header: 'Redeemed',
                  align: 'right' as const,
                  render: (row: Coupon) => (
                    <div>
                      <p className="tabular-nums text-white">
                        {formatNumber(row.redemption_count)}
                        {row.max_redemptions ? ` / ${formatNumber(row.max_redemptions)}` : ''}
                      </p>
                      {row.total_discounted !== null && row.total_discounted > 0 && (
                        <p className="text-[11px] text-amber-300 tabular-nums">
                          {formatCurrency(row.total_discounted)} given
                        </p>
                      )}
                    </div>
                  ),
                },
                {
                  key: 'expiry',
                  header: 'Expires',
                  render: (row: Coupon) => (
                    <span className="text-xs text-slate-400">
                      {row.expires_at ? formatDate(row.expires_at) : 'No expiry'}
                    </span>
                  ),
                },
                {
                  key: 'state',
                  header: 'State',
                  render: (row: Coupon) => <Badge variant={stateVariant(row.state)}>{row.state}</Badge>,
                },
                {
                  key: 'actions',
                  header: '',
                  align: 'right' as const,
                  render: (row: Coupon) => (
                    <div className="flex items-center justify-end gap-1">
                      {!row.stripe_synced && (
                        <button
                          type="button"
                          onClick={() => void handleResync(row)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10"
                          title="Retry Stripe sync"
                        >
                          <RefreshCw size={14} />
                        </button>
                      )}
                      <Button size="sm" variant="secondary" onClick={() => openEditor(row)}>
                        Edit
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => void handleToggle(row)}>
                        {row.is_active ? 'Disable' : 'Enable'}
                      </Button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(row)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-300 hover:bg-rose-500/10"
                        title="Delete"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ),
                },
              ]}
              rows={coupons}
              isLoading={loading}
              rowKey={(row) => row.id}
              emptyMessage="No coupons yet. Create one, then attach it to a win-back campaign."
            />
            <PaginationBar pagination={pagination} onPageChange={setPage} />
          </>
        )}
      </Panel>

      <Card className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-white">Turn an offer into a campaign</p>
          <p className="text-xs text-slate-400">
            Attach any coupon to a win-back or upgrade campaign — the code and discount are inserted into the email
            automatically.
          </p>
        </div>
        <Link to="/admin/campaigns">
          <Button size="sm" variant="secondary">
            Open campaigns
          </Button>
        </Link>
      </Card>

      {/* ------------------------------------------------------------ editor */}
      <Modal
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        title={editing ? `Edit ${editing.code}` : 'New coupon'}
        size="lg"
      >
        <div className="space-y-4">
          {editing && (
            <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-xs text-slate-400">
              Stripe coupons are immutable, so the discount amount and duration can't change after creation. Create a
              new code if you need different maths.
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Code"
              value={form.code}
              disabled={editing !== null}
              onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
              placeholder="COMEBACK30"
              className="font-mono"
            />
            <Input
              label="Internal name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Win-back 30% for 3 months"
            />
          </div>

          <Input
            label="Description"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            placeholder="Used in the 45-day win-back campaign"
          />

          {!editing && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-400 ml-1">Discount type</label>
                  <SelectFilter
                    value={form.discount_type}
                    onChange={(v) => setForm((f) => ({ ...f, discount_type: v as 'percent' | 'amount' }))}
                    options={[
                      { value: 'percent', label: 'Percentage off' },
                      { value: 'amount', label: 'Fixed amount off' },
                    ]}
                    className="w-full"
                    label="Discount type"
                  />
                </div>
                {form.discount_type === 'percent' ? (
                  <Input
                    label="Percent off"
                    type="number"
                    min={1}
                    max={100}
                    value={form.percent_off}
                    onChange={(e) => setForm((f) => ({ ...f, percent_off: e.target.value }))}
                  />
                ) : (
                  <Input
                    label="Amount off"
                    type="number"
                    step="0.01"
                    value={form.amount_off}
                    onChange={(e) => setForm((f) => ({ ...f, amount_off: e.target.value }))}
                  />
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-400 ml-1">Applies for</label>
                  <SelectFilter
                    value={form.duration}
                    onChange={(v) => setForm((f) => ({ ...f, duration: v as CouponForm['duration'] }))}
                    options={DURATION_OPTIONS}
                    className="w-full"
                    label="Duration"
                  />
                </div>
                {form.duration === 'repeating' && (
                  <Input
                    label="Number of months"
                    type="number"
                    min={1}
                    value={form.duration_in_months}
                    onChange={(e) => setForm((f) => ({ ...f, duration_in_months: e.target.value }))}
                  />
                )}
              </div>
            </>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-400 ml-1">Purpose</label>
              <SelectFilter
                value={form.purpose}
                onChange={(v) => setForm((f) => ({ ...f, purpose: v }))}
                options={PURPOSE_OPTIONS}
                className="w-full"
                label="Purpose"
              />
            </div>
            <Input
              label="Max redemptions (0 = unlimited)"
              type="number"
              min={0}
              value={form.max_redemptions}
              onChange={(e) => setForm((f) => ({ ...f, max_redemptions: e.target.value }))}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-400 ml-1">Expires on</label>
            <input
              type="date"
              value={form.expires_at}
              onChange={(e) => setForm((f) => ({ ...f, expires_at: e.target.value }))}
              className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-white focus:outline-none focus:border-primary-500/50"
            />
          </div>

          {plans.length > 0 && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-400 ml-1">
                Restrict to plans (none selected = all plans)
              </label>
              <div className="flex flex-wrap gap-2">
                {plans.map((plan) => {
                  const selected = form.plan_ids.includes(plan.id);
                  return (
                    <button
                      key={plan.id}
                      type="button"
                      onClick={() =>
                        setForm((f) => ({
                          ...f,
                          plan_ids: selected ? f.plan_ids.filter((id) => id !== plan.id) : [...f.plan_ids, plan.id],
                        }))
                      }
                      className={
                        selected
                          ? 'text-xs px-3 py-1.5 rounded-xl bg-primary-500/20 border border-primary-500/40 text-white'
                          : 'text-xs px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-slate-400 hover:text-white'
                      }
                    >
                      {plan.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" size="sm" onClick={() => setEditorOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button size="sm" isLoading={saving} disabled={form.code === ''} onClick={() => void handleSave()}>
              {editing ? 'Save changes' : 'Create coupon'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* -------------------------------------------------------- redemptions */}
      <Modal
        open={detail !== null || detailLoading}
        onClose={() => setDetail(null)}
        title={detail ? `${detail.coupon.code} — redemptions` : 'Loading…'}
        size="xl"
      >
        {detail && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-xl bg-white/5 px-3 py-2">
                <p className="text-[10px] uppercase tracking-wide text-slate-500">Discount</p>
                <p className="text-sm font-semibold text-white">{detail.coupon.discount_label}</p>
              </div>
              <div className="rounded-xl bg-white/5 px-3 py-2">
                <p className="text-[10px] uppercase tracking-wide text-slate-500">Redeemed</p>
                <p className="text-sm font-semibold text-white">{formatNumber(detail.coupon.redemption_count)}</p>
              </div>
              <div className="rounded-xl bg-white/5 px-3 py-2">
                <p className="text-[10px] uppercase tracking-wide text-slate-500">Purpose</p>
                <p className="text-sm font-semibold text-white capitalize">{detail.coupon.purpose}</p>
              </div>
              <div className="rounded-xl bg-white/5 px-3 py-2">
                <p className="text-[10px] uppercase tracking-wide text-slate-500">Expires</p>
                <p className="text-sm font-semibold text-white">
                  {detail.coupon.expires_at ? formatDate(detail.coupon.expires_at) : 'Never'}
                </p>
              </div>
            </div>

            <DataTable
              columns={[
                {
                  key: 'org',
                  header: 'Organization',
                  render: (row: CouponDetail['redemptions'][number]) =>
                    row.organization_id ? (
                      <Link
                        to={`/admin/organizations/${row.organization_id}`}
                        className="text-white hover:text-primary-300"
                      >
                        {row.organization_name ?? `Org #${row.organization_id}`}
                      </Link>
                    ) : (
                      <span className="text-slate-400">Unknown</span>
                    ),
                },
                {
                  key: 'campaign',
                  header: 'Campaign',
                  render: (row: CouponDetail['redemptions'][number]) => (
                    <span className="text-slate-400">{row.campaign_name ?? 'Direct'}</span>
                  ),
                },
                {
                  key: 'amount',
                  header: 'Discount applied',
                  align: 'right' as const,
                  render: (row: CouponDetail['redemptions'][number]) => (
                    <span className="tabular-nums text-amber-300">{formatCurrency(row.amount_discounted)}</span>
                  ),
                },
                {
                  key: 'when',
                  header: 'When',
                  render: (row: CouponDetail['redemptions'][number]) => (
                    <span className="text-xs text-slate-400">{formatDate(row.created_at)}</span>
                  ),
                },
              ]}
              rows={detail.redemptions}
              isLoading={false}
              rowKey={(row) => row.id}
              emptyMessage="Nobody has redeemed this code yet."
            />
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={deleteTarget !== null}
        title={`Delete ${deleteTarget?.code ?? ''}?`}
        description="The code stops working immediately and is deactivated in Stripe. Past redemptions stay in reporting."
        confirmLabel="Delete coupon"
        destructive
        isLoading={busy}
        onConfirm={() => void handleDelete()}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
};

export default AdminCouponsPage;
