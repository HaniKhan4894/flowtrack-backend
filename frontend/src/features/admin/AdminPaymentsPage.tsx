import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AlertTriangle,
  BadgeDollarSign,
  Banknote,
  Download,
  ExternalLink,
  Plus,
  RefreshCw,
  RotateCcw,
  TrendingUp,
  Undo2,
  Wallet,
} from 'lucide-react';
import { growthService } from '../../api/growthService';
import { getApiErrorMessage } from '../../utils/apiError';
import { toastError, toastSuccess } from '../../store/toastStore';
import type {
  DunningQueue,
  PaymentSummary,
  PlatformPayment,
  RevenueReport,
} from '../../types/growth';
import { toPagination } from '../../types/growth';
import type { Pagination } from '../../types/admin';
import { Badge, Button, Card, Input, Modal, Tabs } from '../../components/ui';
import {
  DataTable,
  FilterBar,
  PaginationBar,
  Panel,
  SearchInput,
  SelectFilter,
  StatCard,
  StatusBadge,
} from './components/AdminUI';
import {
  formatCurrency,
  formatDate,
  formatDateTime,
  formatMonthShort,
  formatNumber,
  useDebounced,
} from './components/format';

const CHART_TOOLTIP = {
  background: '#12141C',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 12,
  color: '#fff',
  fontSize: 12,
} as const;

const PIE_COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ec4899', '#06b6d4', '#a855f7'];

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'paid', label: 'Paid' },
  { value: 'failed', label: 'Failed' },
  { value: 'open', label: 'Open' },
  { value: 'refunded', label: 'Refunded' },
  { value: 'partially_refunded', label: 'Partially refunded' },
  { value: 'void', label: 'Void' },
];

const REASON_OPTIONS = [
  { value: '', label: 'Any reason' },
  { value: 'subscription_create', label: 'New subscription' },
  { value: 'subscription_cycle', label: 'Renewal' },
  { value: 'subscription_update', label: 'Plan/seat change' },
  { value: 'manual', label: 'Manual entry' },
];

const MONTH_OPTIONS = [
  { value: '6', label: 'Last 6 months' },
  { value: '12', label: 'Last 12 months' },
  { value: '24', label: 'Last 24 months' },
];

const AdminPaymentsPage = () => {
  const [tab, setTab] = useState('ledger');

  /* ledger */
  const [payments, setPayments] = useState<PlatformPayment[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [summary, setSummary] = useState<PaymentSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [reason, setReason] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebounced(search);

  /* revenue */
  const [revenue, setRevenue] = useState<RevenueReport | null>(null);
  const [revenueMonths, setRevenueMonths] = useState('12');
  const [revenueLoading, setRevenueLoading] = useState(false);

  /* dunning */
  const [dunning, setDunning] = useState<DunningQueue | null>(null);
  const [dunningLoading, setDunningLoading] = useState(false);

  /* actions */
  const [refundTarget, setRefundTarget] = useState<PlatformPayment | null>(null);
  const [refundForm, setRefundForm] = useState({ amount: '', reason: '' });
  const [manualOpen, setManualOpen] = useState(false);
  const [manualForm, setManualForm] = useState({
    organization_id: '',
    amount: '',
    currency: 'usd',
    reference: '',
    notes: '',
  });
  const [busy, setBusy] = useState(false);

  const filters = useMemo(
    () => ({ search: debouncedSearch, status, billing_reason: reason, from, to }),
    [debouncedSearch, status, reason, from, to],
  );

  const loadLedger = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [list, totals] = await Promise.all([
        growthService.getPayments({ ...filters, page, per_page: 25 }),
        growthService.getPaymentSummary({ from, to }),
      ]);
      setPayments(list.data.data ?? []);
      setPagination(toPagination(list.data.meta));
      setSummary(totals.data);
    } catch (e) {
      setError(getApiErrorMessage(e, 'Could not load payments'));
    } finally {
      setLoading(false);
    }
  }, [filters, page, from, to]);

  useEffect(() => {
    void loadLedger();
  }, [loadLedger]);

  const loadRevenue = useCallback(async () => {
    setRevenueLoading(true);
    try {
      const response = await growthService.getRevenueReport(Number(revenueMonths));
      setRevenue(response.data);
    } catch (e) {
      toastError(getApiErrorMessage(e, 'Could not load the revenue report'));
    } finally {
      setRevenueLoading(false);
    }
  }, [revenueMonths]);

  useEffect(() => {
    if (tab === 'revenue') void loadRevenue();
  }, [tab, loadRevenue]);

  const loadDunning = useCallback(async () => {
    setDunningLoading(true);
    try {
      const response = await growthService.getDunningQueue();
      setDunning(response.data);
    } catch (e) {
      toastError(getApiErrorMessage(e, 'Could not load the dunning queue'));
    } finally {
      setDunningLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === 'dunning') void loadDunning();
  }, [tab, loadDunning]);

  const handleRetry = async (paymentId: number) => {
    setBusy(true);
    try {
      await growthService.retryPayment(paymentId);
      toastSuccess('Stripe is retrying the charge');
      await Promise.all([loadDunning(), loadLedger()]);
    } catch (e) {
      toastError(getApiErrorMessage(e, 'Retry failed'));
    } finally {
      setBusy(false);
    }
  };

  const handleRefund = async () => {
    if (!refundTarget) return;
    setBusy(true);
    try {
      await growthService.refundPayment(refundTarget.id, {
        amount: refundForm.amount === '' ? undefined : Number(refundForm.amount),
        reason: refundForm.reason || 'Refunded by platform admin',
      });
      toastSuccess('Refund issued');
      setRefundTarget(null);
      setRefundForm({ amount: '', reason: '' });
      await loadLedger();
    } catch (e) {
      toastError(getApiErrorMessage(e, 'Refund failed'));
    } finally {
      setBusy(false);
    }
  };

  const handleManualPayment = async () => {
    setBusy(true);
    try {
      await growthService.recordManualPayment({
        organization_id: manualForm.organization_id ? Number(manualForm.organization_id) : undefined,
        amount: Number(manualForm.amount),
        currency: manualForm.currency,
        reference: manualForm.reference || undefined,
        notes: manualForm.notes || undefined,
      });
      toastSuccess('Payment recorded in the ledger');
      setManualOpen(false);
      setManualForm({ organization_id: '', amount: '', currency: 'usd', reference: '', notes: '' });
      await loadLedger();
    } catch (e) {
      toastError(getApiErrorMessage(e, 'Could not record the payment'));
    } finally {
      setBusy(false);
    }
  };

  const handleExport = async () => {
    try {
      const blob = await growthService.downloadPaymentsCsv(filters);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `platform-payments-${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toastError(getApiErrorMessage(e, 'Export failed'));
    }
  };

  const ledgerColumns = [
    {
      key: 'organization',
      header: 'Organization',
      render: (row: PlatformPayment) => (
        <div className="min-w-0">
          {row.organization_id ? (
            <Link
              to={`/admin/organizations/${row.organization_id}`}
              className="font-medium text-white hover:text-primary-300 truncate block"
            >
              {row.organization_name ?? `Org #${row.organization_id}`}
            </Link>
          ) : (
            <span className="font-medium text-slate-400">Unlinked</span>
          )}
          <p className="text-xs text-slate-500 truncate">
            {row.plan_name ?? '—'}
            {row.seats ? ` · ${row.seats} seats` : ''}
            {row.coupon_code ? ` · ${row.coupon_code}` : ''}
          </p>
        </div>
      ),
    },
    {
      key: 'amount',
      header: 'Amount',
      align: 'right' as const,
      render: (row: PlatformPayment) => (
        <div>
          <p className="font-semibold text-white tabular-nums">{formatCurrency(row.amount, row.currency)}</p>
          {row.amount_refunded > 0 && (
            <p className="text-xs text-rose-300 tabular-nums">−{formatCurrency(row.amount_refunded, row.currency)}</p>
          )}
          {row.discount_amount > 0 && (
            <p className="text-xs text-emerald-300 tabular-nums">
              {formatCurrency(row.discount_amount, row.currency)} off
            </p>
          )}
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row: PlatformPayment) => (
        <div className="space-y-1">
          <StatusBadge status={row.status} />
          {row.failure_message && (
            <p className="text-[11px] text-rose-300/80 max-w-[220px] truncate" title={row.failure_message}>
              {row.failure_message}
            </p>
          )}
        </div>
      ),
    },
    {
      key: 'reason',
      header: 'Type',
      render: (row: PlatformPayment) => (
        <span className="text-xs text-slate-400 capitalize">
          {(row.billing_reason ?? 'unknown').replace(/_/g, ' ')}
        </span>
      ),
    },
    {
      key: 'date',
      header: 'Date',
      render: (row: PlatformPayment) => (
        <div>
          <p className="text-xs text-slate-300">{formatDateTime(row.paid_at ?? row.failed_at ?? row.created_at)}</p>
          {row.period_start && (
            <p className="text-[11px] text-slate-500">
              {formatDate(row.period_start)} → {formatDate(row.period_end)}
            </p>
          )}
        </div>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right' as const,
      render: (row: PlatformPayment) => (
        <div className="flex items-center justify-end gap-1">
          {row.hosted_invoice_url && (
            <a
              href={row.hosted_invoice_url}
              target="_blank"
              rel="noreferrer"
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10"
              title="Open Stripe invoice"
            >
              <ExternalLink size={14} />
            </a>
          )}
          {row.status === 'failed' && row.stripe_invoice_id && (
            <button
              type="button"
              onClick={() => void handleRetry(row.id)}
              disabled={busy}
              className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-40"
              title="Retry charge"
            >
              <RotateCcw size={14} />
            </button>
          )}
          {row.can_refund && (
            <button
              type="button"
              onClick={() => {
                setRefundTarget(row);
                setRefundForm({ amount: '', reason: '' });
              }}
              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-300 hover:bg-rose-500/10"
              title="Refund"
            >
              <Undo2 size={14} />
            </button>
          )}
        </div>
      ),
    },
  ];

  const revenueChart = (revenue?.trend ?? []).map((point) => ({
    ...point,
    label: formatMonthShort(point.month),
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs
          tabs={[
            { id: 'ledger', label: 'Payment log' },
            { id: 'revenue', label: 'Revenue reports' },
            {
              id: 'dunning',
              label: 'Failed & past due',
              count: dunning ? dunning.failed_count + dunning.past_due_count : undefined,
            },
          ]}
          activeId={tab}
          onChange={setTab}
        />
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => setManualOpen(true)}>
            <Plus size={14} />
            Record payment
          </Button>
          <Button variant="secondary" size="sm" onClick={() => void handleExport()}>
            <Download size={14} />
            Export CSV
          </Button>
        </div>
      </div>

      {tab === 'ledger' && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <StatCard
              icon={Wallet}
              label="Collected"
              value={formatCurrency(summary?.collected ?? 0)}
              hint={`${formatNumber(summary?.paid_count ?? 0)} successful charges`}
              tone="positive"
            />
            <StatCard
              icon={Undo2}
              label="Refunded"
              value={formatCurrency(summary?.refunded ?? 0)}
              hint={`Net ${formatCurrency(summary?.net ?? 0)}`}
              tone={(summary?.refunded ?? 0) > 0 ? 'warning' : 'default'}
            />
            <StatCard
              icon={AlertTriangle}
              label="Failed charges"
              value={formatCurrency(summary?.failed_amount ?? 0)}
              hint={`${formatNumber(summary?.failed_count ?? 0)} failures · ${summary?.payment_success_rate ?? 100}% success`}
              tone={(summary?.failed_count ?? 0) > 0 ? 'danger' : 'default'}
            />
            <StatCard
              icon={BadgeDollarSign}
              label="Avg lifetime value"
              value={formatCurrency(summary?.average_lifetime_value ?? 0)}
              hint={`Avg invoice ${formatCurrency(summary?.average_invoice ?? 0)}`}
            />
          </div>

          <Panel
            title="Payment log"
            description="Every platform charge, refund and failed attempt captured from Stripe."
            action={
              <Button variant="secondary" size="sm" onClick={() => void loadLedger()}>
                <RefreshCw size={14} />
              </Button>
            }
          >
            <FilterBar>
              <SearchInput value={search} onChange={setSearch} placeholder="Organization, invoice #, coupon…" />
              <SelectFilter value={status} onChange={setStatus} options={STATUS_OPTIONS} label="Status" />
              <SelectFilter value={reason} onChange={setReason} options={REASON_OPTIONS} label="Type" />
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                aria-label="From date"
                className="bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-primary-500/50"
              />
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                aria-label="To date"
                className="bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-primary-500/50"
              />
            </FilterBar>

            {error ? (
              <p className="text-sm text-rose-300 py-6 text-center">{error}</p>
            ) : (
              <>
                <DataTable
                  columns={ledgerColumns}
                  rows={payments}
                  isLoading={loading}
                  rowKey={(row) => row.id}
                  emptyMessage="No payments recorded yet. Run `php spark stripe:backfill-payments` to import history from Stripe."
                />
                <PaginationBar pagination={pagination} onPageChange={setPage} />
              </>
            )}
          </Panel>
        </>
      )}

      {tab === 'revenue' && (
        <div className="space-y-6">
          <div className="flex justify-end">
            <SelectFilter value={revenueMonths} onChange={setRevenueMonths} options={MONTH_OPTIONS} label="Range" />
          </div>

          <Panel title="Collected vs refunded" description="Actual cash movement per month, split by revenue type.">
            {revenueLoading ? (
              <div className="h-72 animate-pulse rounded-xl bg-white/5" />
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={revenueChart}>
                  <defs>
                    <linearGradient id="netRevenue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#22c55e" stopOpacity={0.45} />
                      <stop offset="100%" stopColor="#22c55e" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="label" stroke="#64748b" fontSize={11} />
                  <YAxis stroke="#64748b" fontSize={11} />
                  <Tooltip contentStyle={CHART_TOOLTIP} formatter={(v) => formatCurrency(Number(v))} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Area type="monotone" dataKey="net" name="Net collected" stroke="#22c55e" fill="url(#netRevenue)" />
                  <Area type="monotone" dataKey="refunded" name="Refunded" stroke="#f43f5e" fillOpacity={0} />
                  <Area type="monotone" dataKey="failed_amount" name="Failed" stroke="#f59e0b" fillOpacity={0} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </Panel>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <Panel title="New vs renewal vs expansion" description="Where each month's revenue came from.">
              {revenueLoading ? (
                <div className="h-64 animate-pulse rounded-xl bg-white/5" />
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={revenueChart}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis dataKey="label" stroke="#64748b" fontSize={11} />
                    <YAxis stroke="#64748b" fontSize={11} />
                    <Tooltip contentStyle={CHART_TOOLTIP} formatter={(v) => formatCurrency(Number(v))} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="new_business" name="New" stackId="r" fill="#6366f1" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="renewals" name="Renewals" stackId="r" fill="#22c55e" />
                    <Bar dataKey="expansion" name="Expansion" stackId="r" fill="#f59e0b" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Panel>

            <Panel title="Revenue by plan" description="Lifetime collected revenue per plan.">
              {revenueLoading ? (
                <div className="h-64 animate-pulse rounded-xl bg-white/5" />
              ) : (revenue?.by_plan ?? []).length === 0 ? (
                <p className="text-sm text-slate-500 py-10 text-center">No plan revenue yet.</p>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie
                      data={revenue?.by_plan ?? []}
                      dataKey="revenue"
                      nameKey="plan_name"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={3}
                    >
                      {(revenue?.by_plan ?? []).map((entry, index) => (
                        <Cell key={entry.plan_name} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={CHART_TOOLTIP} formatter={(v) => formatCurrency(Number(v))} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </Panel>
          </div>

          <Panel title="Highest lifetime value accounts" description="Your most valuable customers by collected revenue.">
            <DataTable
              columns={[
                {
                  key: 'org',
                  header: 'Organization',
                  render: (row: RevenueReport['top_organizations'][number]) =>
                    row.organization_id ? (
                      <Link
                        to={`/admin/organizations/${row.organization_id}`}
                        className="font-medium text-white hover:text-primary-300"
                      >
                        {row.organization_name ?? `Org #${row.organization_id}`}
                      </Link>
                    ) : (
                      <span className="text-slate-400">Unlinked</span>
                    ),
                },
                {
                  key: 'ltv',
                  header: 'Lifetime value',
                  align: 'right' as const,
                  render: (row: RevenueReport['top_organizations'][number]) => (
                    <span className="font-semibold text-emerald-300 tabular-nums">
                      {formatCurrency(row.lifetime_value)}
                    </span>
                  ),
                },
                {
                  key: 'invoices',
                  header: 'Invoices',
                  align: 'right' as const,
                  render: (row: RevenueReport['top_organizations'][number]) => formatNumber(row.invoices),
                },
                {
                  key: 'last',
                  header: 'Last payment',
                  render: (row: RevenueReport['top_organizations'][number]) => formatDate(row.last_payment_at),
                },
              ]}
              rows={revenue?.top_organizations ?? []}
              isLoading={revenueLoading}
              rowKey={(row) => row.organization_id ?? Math.random()}
              emptyMessage="No paying accounts yet."
            />
          </Panel>
        </div>
      )}

      {tab === 'dunning' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatCard
              icon={AlertTriangle}
              label="MRR at risk"
              value={formatCurrency(dunning?.mrr_at_risk ?? 0)}
              hint="From past-due subscriptions"
              tone="danger"
            />
            <StatCard
              icon={Banknote}
              label="Failed invoices"
              value={formatNumber(dunning?.failed_count ?? 0)}
              hint="Not yet recovered"
              tone="warning"
            />
            <StatCard
              icon={TrendingUp}
              label="Past-due accounts"
              value={formatNumber(dunning?.past_due_count ?? 0)}
              hint="Subscription status past_due"
              tone="warning"
            />
          </div>

          <Panel
            title="Failed invoices"
            description="Charges Stripe could not collect. Retry, or reach out with a dunning campaign."
            action={
              <Button variant="secondary" size="sm" onClick={() => void loadDunning()}>
                <RefreshCw size={14} />
              </Button>
            }
          >
            <DataTable
              columns={[
                {
                  key: 'org',
                  header: 'Organization',
                  render: (row: DunningQueue['failed_invoices'][number]) => (
                    <div className="min-w-0">
                      {row.organization_id ? (
                        <Link
                          to={`/admin/organizations/${row.organization_id}`}
                          className="font-medium text-white hover:text-primary-300"
                        >
                          {row.organization_name ?? `Org #${row.organization_id}`}
                        </Link>
                      ) : (
                        <span className="text-slate-400">Unlinked</span>
                      )}
                      <p className="text-xs text-slate-500 truncate">{row.owner_email ?? '—'}</p>
                    </div>
                  ),
                },
                {
                  key: 'amount',
                  header: 'Amount',
                  align: 'right' as const,
                  render: (row: DunningQueue['failed_invoices'][number]) => (
                    <span className="font-semibold text-white tabular-nums">
                      {formatCurrency(row.amount, row.currency)}
                    </span>
                  ),
                },
                {
                  key: 'overdue',
                  header: 'Overdue',
                  render: (row: DunningQueue['failed_invoices'][number]) => (
                    <Badge variant={row.days_overdue > 14 ? 'danger' : 'warning'}>{row.days_overdue}d</Badge>
                  ),
                },
                {
                  key: 'attempts',
                  header: 'Attempts',
                  align: 'right' as const,
                  render: (row: DunningQueue['failed_invoices'][number]) => formatNumber(row.attempt_count),
                },
                {
                  key: 'why',
                  header: 'Reason',
                  render: (row: DunningQueue['failed_invoices'][number]) => (
                    <span className="text-xs text-rose-300/90">{row.failure_message ?? 'Unknown'}</span>
                  ),
                },
                {
                  key: 'actions',
                  header: '',
                  align: 'right' as const,
                  render: (row: DunningQueue['failed_invoices'][number]) => (
                    <div className="flex items-center justify-end gap-1">
                      {row.hosted_invoice_url && (
                        <a
                          href={row.hosted_invoice_url}
                          target="_blank"
                          rel="noreferrer"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10"
                          title="Open invoice"
                        >
                          <ExternalLink size={14} />
                        </a>
                      )}
                      {row.can_retry && (
                        <Button size="sm" variant="secondary" disabled={busy} onClick={() => void handleRetry(row.id)}>
                          <RotateCcw size={13} />
                          Retry
                        </Button>
                      )}
                    </div>
                  ),
                },
              ]}
              rows={dunning?.failed_invoices ?? []}
              isLoading={dunningLoading}
              rowKey={(row) => row.id}
              emptyMessage="No failed invoices — collections are healthy."
            />
          </Panel>

          <Panel
            title="Past-due subscriptions"
            description="Accounts whose billing period lapsed without a successful payment."
          >
            <DataTable
              columns={[
                {
                  key: 'org',
                  header: 'Organization',
                  render: (row: DunningQueue['past_due_subscriptions'][number]) => (
                    <div className="min-w-0">
                      <Link
                        to={`/admin/organizations/${row.organization_id}`}
                        className="font-medium text-white hover:text-primary-300"
                      >
                        {row.organization_name ?? `Org #${row.organization_id}`}
                      </Link>
                      <p className="text-xs text-slate-500 truncate">{row.owner_email ?? '—'}</p>
                    </div>
                  ),
                },
                {
                  key: 'plan',
                  header: 'Plan',
                  render: (row: DunningQueue['past_due_subscriptions'][number]) => (
                    <span className="text-slate-300">
                      {row.plan_name ?? '—'} · {row.billing_cycle ?? 'monthly'}
                    </span>
                  ),
                },
                {
                  key: 'amount',
                  header: 'Amount',
                  align: 'right' as const,
                  render: (row: DunningQueue['past_due_subscriptions'][number]) => (
                    <span className="tabular-nums text-white">{formatCurrency(row.amount)}</span>
                  ),
                },
                {
                  key: 'since',
                  header: 'Period ended',
                  render: (row: DunningQueue['past_due_subscriptions'][number]) => (
                    <div>
                      <p className="text-xs text-slate-300">{formatDate(row.current_period_end)}</p>
                      <p className="text-[11px] text-amber-300">{row.days_overdue}d overdue</p>
                    </div>
                  ),
                },
              ]}
              rows={dunning?.past_due_subscriptions ?? []}
              isLoading={dunningLoading}
              rowKey={(row) => row.organization_id}
              emptyMessage="No past-due subscriptions."
            />
          </Panel>

          <Card className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-white">Automate recovery</p>
              <p className="text-xs text-slate-400">
                Install the dunning playbook to email these accounts automatically until they update their card.
              </p>
            </div>
            <Link to="/admin/campaigns">
              <Button size="sm" variant="secondary">
                Open campaigns
              </Button>
            </Link>
          </Card>
        </div>
      )}

      <Modal
        open={refundTarget !== null}
        onClose={() => setRefundTarget(null)}
        title={`Refund ${refundTarget ? formatCurrency(refundTarget.net_amount, refundTarget.currency) : ''}`}
        size="md"
      >
        <div className="space-y-4">
          <div className="rounded-xl border border-rose-500/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
            This sends a real refund through Stripe and is recorded in the audit log.
          </div>
          <Input
            label="Amount (leave empty for full refund)"
            type="number"
            step="0.01"
            value={refundForm.amount}
            onChange={(e) => setRefundForm((f) => ({ ...f, amount: e.target.value }))}
            placeholder={refundTarget ? String(refundTarget.net_amount) : ''}
          />
          <Input
            label="Reason"
            value={refundForm.reason}
            onChange={(e) => setRefundForm((f) => ({ ...f, reason: e.target.value }))}
            placeholder="Customer requested — ticket #1234"
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setRefundTarget(null)} disabled={busy}>
              Cancel
            </Button>
            <Button
              size="sm"
              isLoading={busy}
              onClick={() => void handleRefund()}
              className="bg-rose-500 hover:bg-rose-400 shadow-none"
            >
              Issue refund
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={manualOpen} onClose={() => setManualOpen(false)} title="Record a manual payment" size="md">
        <div className="space-y-4">
          <p className="text-sm text-slate-400">
            Use this for bank transfers or offline invoices so reports reflect all revenue.
          </p>
          <Input
            label="Organization ID"
            type="number"
            value={manualForm.organization_id}
            onChange={(e) => setManualForm((f) => ({ ...f, organization_id: e.target.value }))}
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Amount"
              type="number"
              step="0.01"
              value={manualForm.amount}
              onChange={(e) => setManualForm((f) => ({ ...f, amount: e.target.value }))}
            />
            <Input
              label="Currency"
              value={manualForm.currency}
              onChange={(e) => setManualForm((f) => ({ ...f, currency: e.target.value }))}
            />
          </div>
          <Input
            label="Reference"
            value={manualForm.reference}
            onChange={(e) => setManualForm((f) => ({ ...f, reference: e.target.value }))}
            placeholder="Wire transfer 8842"
          />
          <Input
            label="Notes"
            value={manualForm.notes}
            onChange={(e) => setManualForm((f) => ({ ...f, notes: e.target.value }))}
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setManualOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button
              size="sm"
              isLoading={busy}
              disabled={manualForm.amount === ''}
              onClick={() => void handleManualPayment()}
            >
              Record payment
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default AdminPaymentsPage;
