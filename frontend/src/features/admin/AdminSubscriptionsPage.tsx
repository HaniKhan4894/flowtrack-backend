import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CreditCard, FileText, Pencil, TrendingUp } from 'lucide-react';
import { adminService } from '../../api/adminService';
import { getApiErrorMessage } from '../../utils/apiError';
import { toastError, toastSuccess } from '../../store/toastStore';
import type {
  AdminInvoice,
  AdminRevenuePoint,
  AdminSubscription,
  AdminSubscriptionSummary,
  Pagination,
} from '../../types/admin';
import { Badge, Button, Card, Modal, Tabs } from '../../components/ui';
import { DataTable, FilterBar, PaginationBar, SearchInput, SelectFilter, StatusBadge } from './components/AdminUI';
import { formatCurrency, formatDate, formatNumber, useDebounced } from './components/format';

const CHART_TOOLTIP = {
  background: '#12141C',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 12,
  color: '#fff',
  fontSize: 12,
} as const;

const SUB_STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'trial', label: 'Trial' },
  { value: 'active', label: 'Active' },
  { value: 'past_due', label: 'Past due' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'expired', label: 'Expired' },
];

const CYCLE_OPTIONS = [
  { value: '', label: 'Any cycle' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' },
];

const STRIPE_OPTIONS = [
  { value: '', label: 'Stripe: any' },
  { value: '1', label: 'Stripe linked' },
  { value: '0', label: 'Manual only' },
];

const INVOICE_STATUS_OPTIONS = [
  { value: '', label: 'All invoices' },
  { value: 'draft', label: 'Draft' },
  { value: 'sent', label: 'Sent' },
  { value: 'paid', label: 'Paid' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'cancelled', label: 'Cancelled' },
];

const STATUS_CHOICES = ['trial', 'active', 'past_due', 'cancelled', 'expired'];

const AdminSubscriptionsPage = () => {
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState('subscriptions');

  /* subscriptions */
  const [subs, setSubs] = useState<AdminSubscription[]>([]);
  const [summary, setSummary] = useState<AdminSubscriptionSummary>({});
  const [subsPagination, setSubsPagination] = useState<Pagination | null>(null);
  const [subsLoading, setSubsLoading] = useState(true);
  const [subsError, setSubsError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState(searchParams.get('status') ?? '');
  const [cycle, setCycle] = useState('');
  const [stripe, setStripe] = useState('');
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebounced(search);

  /* status editing */
  const [editing, setEditing] = useState<AdminSubscription | null>(null);
  const [editForm, setEditForm] = useState({ status: 'active', reason: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);

  /* revenue */
  const [revenue, setRevenue] = useState<AdminRevenuePoint[]>([]);
  const [revenueLoading, setRevenueLoading] = useState(false);

  /* invoices */
  const [invoices, setInvoices] = useState<AdminInvoice[]>([]);
  const [invoiceTotals, setInvoiceTotals] = useState<Array<{ status: string; count: number; amount: string }>>([]);
  const [invoicePagination, setInvoicePagination] = useState<Pagination | null>(null);
  const [invoiceLoading, setInvoiceLoading] = useState(false);
  const [invoiceSearch, setInvoiceSearch] = useState('');
  const [invoiceStatus, setInvoiceStatus] = useState('');
  const [invoicePage, setInvoicePage] = useState(1);
  const debouncedInvoiceSearch = useDebounced(invoiceSearch);

  const loadSubscriptions = useCallback(async () => {
    setSubsLoading(true);
    setSubsError(null);
    try {
      const response = await adminService.getSubscriptions({
        search: debouncedSearch,
        status,
        billing_cycle: cycle,
        stripe,
        page,
        per_page: 25,
      });
      setSubs(response.data ?? []);
      setSummary(response.summary ?? {});
      setSubsPagination(response.pagination ?? null);
    } catch (e) {
      setSubsError(getApiErrorMessage(e, 'Could not load subscriptions'));
    } finally {
      setSubsLoading(false);
    }
  }, [debouncedSearch, status, cycle, stripe, page]);

  useEffect(() => {
    void loadSubscriptions();
  }, [loadSubscriptions]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, status, cycle, stripe]);

  useEffect(() => {
    if (tab !== 'revenue' || revenue.length > 0) return;
    setRevenueLoading(true);
    adminService
      .getRevenueTrend(12)
      .then((response) => setRevenue(response.data))
      .catch((e) => toastError(getApiErrorMessage(e, 'Could not load revenue trend')))
      .finally(() => setRevenueLoading(false));
  }, [tab, revenue.length]);

  const loadInvoices = useCallback(async () => {
    setInvoiceLoading(true);
    try {
      const response = await adminService.getInvoices({
        search: debouncedInvoiceSearch,
        status: invoiceStatus,
        page: invoicePage,
        per_page: 25,
      });
      setInvoices(response.data ?? []);
      setInvoiceTotals(response.totals_by_status ?? []);
      setInvoicePagination(response.pagination ?? null);
    } catch (e) {
      toastError(getApiErrorMessage(e, 'Could not load invoices'));
    } finally {
      setInvoiceLoading(false);
    }
  }, [debouncedInvoiceSearch, invoiceStatus, invoicePage]);

  useEffect(() => {
    if (tab !== 'invoices') return;
    void loadInvoices();
  }, [tab, loadInvoices]);

  const summaryCards = useMemo(
    () =>
      Object.entries(summary).map(([key, value]) => ({
        status: key,
        accounts: value.accounts,
        mrr: value.mrr,
        seats: value.seats,
      })),
    [summary],
  );

  const saveStatus = async () => {
    if (!editing) return;
    setIsSubmitting(true);
    try {
      await adminService.updateSubscriptionStatus(editing.id, editForm.status, editForm.reason || undefined);
      toastSuccess('Subscription status updated');
      setEditing(null);
      void loadSubscriptions();
    } catch (e) {
      toastError(getApiErrorMessage(e, 'Could not update subscription'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-5">
      <Tabs
        tabs={[
          { id: 'subscriptions', label: 'Subscriptions', icon: <CreditCard size={14} /> },
          { id: 'revenue', label: 'Revenue trend', icon: <TrendingUp size={14} /> },
          { id: 'invoices', label: 'Client invoices', icon: <FileText size={14} /> },
        ]}
        activeId={tab}
        onChange={setTab}
        className="w-fit"
      />

      {tab === 'subscriptions' && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            {summaryCards.map((card) => (
              <Card key={card.status}>
                <StatusBadge status={card.status} />
                <p className="text-lg font-bold text-white mt-2">{formatNumber(card.accounts)}</p>
                <p className="text-xs text-slate-500">
                  {formatCurrency(card.mrr)} MRR · {formatNumber(card.seats)} seats
                </p>
              </Card>
            ))}
          </div>

          <Card padding="none">
            <div className="p-5">
              <FilterBar>
                <SearchInput value={search} onChange={setSearch} placeholder="Search org, slug, or Stripe ID…" />
                <SelectFilter value={status} onChange={setStatus} options={SUB_STATUS_OPTIONS} label="Status" />
                <SelectFilter value={cycle} onChange={setCycle} options={CYCLE_OPTIONS} label="Billing cycle" />
                <SelectFilter value={stripe} onChange={setStripe} options={STRIPE_OPTIONS} label="Stripe" />
              </FilterBar>

              {subsError ? (
                <p className="text-sm text-rose-300 py-6 text-center">{subsError}</p>
              ) : (
                <>
                  <DataTable
                    rows={subs}
                    isLoading={subsLoading}
                    rowKey={(row) => row.id}
                    emptyMessage="No subscriptions match these filters."
                    columns={[
                      {
                        key: 'org',
                        header: 'Organization',
                        render: (row) => (
                          <Link to={`/admin/organizations/${row.organization_id}`} className="block min-w-0 group">
                            <span className="text-white font-medium group-hover:text-primary-300 block truncate">
                              {row.organization_name}
                            </span>
                            <span className="text-xs text-slate-500 block truncate">{row.owner_email ?? row.organization_slug}</span>
                          </Link>
                        ),
                      },
                      { key: 'plan', header: 'Plan', render: (row) => row.plan_name ?? '—' },
                      { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
                      { key: 'cycle', header: 'Cycle', render: (row) => row.billing_cycle },
                      { key: 'amount', header: 'Amount', align: 'right', render: (row) => formatCurrency(row.amount) },
                      {
                        key: 'mrr',
                        header: 'MRR',
                        align: 'right',
                        render: (row) => <span className="text-emerald-300">{formatCurrency(row.mrr)}</span>,
                      },
                      { key: 'seats', header: 'Seats', align: 'right', render: (row) => formatNumber(row.user_count) },
                      {
                        key: 'period',
                        header: 'Renews',
                        align: 'right',
                        render: (row) => (
                          <span className="text-xs text-slate-400">
                            {formatDate(row.current_period_end)}
                            {row.cancel_at_period_end && <span className="block text-amber-300">cancelling</span>}
                          </span>
                        ),
                      },
                      {
                        key: 'stripe',
                        header: 'Source',
                        render: (row) =>
                          row.is_stripe_linked ? <Badge variant="info">Stripe</Badge> : <Badge>Manual</Badge>,
                      },
                      {
                        key: 'actions',
                        header: '',
                        align: 'right',
                        render: (row) => (
                          <button
                            type="button"
                            onClick={() => {
                              setEditing(row);
                              setEditForm({ status: row.status, reason: '' });
                            }}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10"
                            aria-label={`Edit status for ${row.organization_name}`}
                          >
                            <Pencil size={14} />
                          </button>
                        ),
                      },
                    ]}
                  />
                  <PaginationBar pagination={subsPagination} onPageChange={setPage} />
                </>
              )}
            </div>
          </Card>
        </>
      )}

      {tab === 'revenue' && (
        <Card>
          <div className="mb-4">
            <h2 className="text-sm font-bold text-white">Revenue movement by month</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              New business, expansion from upgrades, and cancellation counts derived from subscription history.
            </p>
          </div>
          {revenueLoading ? (
            <p className="text-sm text-slate-500 py-16 text-center">Loading revenue trend…</p>
          ) : revenue.length === 0 ? (
            <p className="text-sm text-slate-500 py-16 text-center">No billing history recorded yet.</p>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={revenue} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
                  <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                  <YAxis yAxisId="left" tick={{ fill: '#94a3b8', fontSize: 11 }} width={56} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fill: '#94a3b8', fontSize: 11 }} width={34} allowDecimals={false} />
                  <Tooltip contentStyle={CHART_TOOLTIP} />
                  <Legend wrapperStyle={{ fontSize: 12, color: '#94a3b8' }} />
                  <Bar yAxisId="left" dataKey="new_revenue" name="New" fill="#34d399" radius={[4, 4, 0, 0]} maxBarSize={26} />
                  <Bar yAxisId="left" dataKey="expansion_revenue" name="Expansion" fill="#38bdf8" radius={[4, 4, 0, 0]} maxBarSize={26} />
                  <Bar yAxisId="right" dataKey="cancellations" name="Cancellations" fill="#f87171" radius={[4, 4, 0, 0]} maxBarSize={26} />
                </BarChart>
              </ResponsiveContainer>

              <div className="mt-5">
                <DataTable
                  rows={revenue}
                  rowKey={(row) => row.month}
                  columns={[
                    { key: 'month', header: 'Month', render: (row) => row.label },
                    { key: 'new', header: 'New revenue', align: 'right', render: (row) => formatCurrency(row.new_revenue) },
                    {
                      key: 'expansion',
                      header: 'Expansion',
                      align: 'right',
                      render: (row) => formatCurrency(row.expansion_revenue),
                    },
                    {
                      key: 'churn',
                      header: 'Cancellations',
                      align: 'right',
                      render: (row) => <span className="text-rose-300">{formatNumber(row.cancellations)}</span>,
                    },
                    { key: 'events', header: 'Events', align: 'right', render: (row) => formatNumber(row.events) },
                  ]}
                />
              </div>
            </>
          )}
        </Card>
      )}

      {tab === 'invoices' && (
        <>
          {invoiceTotals.length > 0 && (
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
              {invoiceTotals.map((total) => (
                <Card key={total.status}>
                  <StatusBadge status={total.status} />
                  <p className="text-lg font-bold text-white mt-2">{formatCurrency(total.amount)}</p>
                  <p className="text-xs text-slate-500">{formatNumber(total.count)} invoices</p>
                </Card>
              ))}
            </div>
          )}

          <Card padding="none">
            <div className="p-5">
              <FilterBar>
                <SearchInput
                  value={invoiceSearch}
                  onChange={setInvoiceSearch}
                  placeholder="Search invoice number or client…"
                />
                <SelectFilter
                  value={invoiceStatus}
                  onChange={(value) => {
                    setInvoiceStatus(value);
                    setInvoicePage(1);
                  }}
                  options={INVOICE_STATUS_OPTIONS}
                  label="Invoice status"
                />
              </FilterBar>

              <DataTable
                rows={invoices}
                isLoading={invoiceLoading}
                rowKey={(row) => row.id}
                emptyMessage="No invoices found. These are invoices tenants issue to their own clients."
                columns={[
                  {
                    key: 'number',
                    header: 'Invoice',
                    render: (row) => <span className="font-mono text-xs text-white">{row.invoice_number}</span>,
                  },
                  {
                    key: 'org',
                    header: 'Organization',
                    render: (row) => (
                      <Link to={`/admin/organizations/${row.organization_id}`} className="text-slate-200 hover:text-primary-300">
                        {row.organization_name ?? `Org #${row.organization_id}`}
                      </Link>
                    ),
                  },
                  {
                    key: 'client',
                    header: 'Client',
                    render: (row) => (
                      <div className="min-w-0">
                        <span className="text-slate-200 block truncate">{row.client_name}</span>
                        <span className="text-xs text-slate-500 block truncate">{row.client_email ?? ''}</span>
                      </div>
                    ),
                  },
                  { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
                  {
                    key: 'total',
                    header: 'Total',
                    align: 'right',
                    render: (row) => formatCurrency(row.total, row.currency || 'USD'),
                  },
                  { key: 'issued', header: 'Issued', align: 'right', render: (row) => formatDate(row.issue_date) },
                  { key: 'due', header: 'Due', align: 'right', render: (row) => formatDate(row.due_date) },
                ]}
              />
              <PaginationBar pagination={invoicePagination} onPageChange={setInvoicePage} />
            </div>
          </Card>
        </>
      )}

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={`Update subscription — ${editing?.organization_name ?? ''}`}
        size="md"
      >
        <div className="space-y-4">
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-slate-400">Status</span>
            <select
              value={editForm.status}
              onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-primary-500/50"
            >
              {STATUS_CHOICES.map((choice) => (
                <option key={choice} value={choice} className="bg-[#12141C]">
                  {choice.replace('_', ' ')}
                </option>
              ))}
            </select>
          </label>

          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-slate-400">Reason (audit log)</span>
            <input
              value={editForm.reason}
              onChange={(e) => setEditForm({ ...editForm, reason: e.target.value })}
              placeholder="Refund issued, payment recovered, …"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-primary-500/50"
            />
          </label>

          {editing?.is_stripe_linked && (
            <p className="text-xs text-amber-300/90 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2">
              This subscription is linked to Stripe. Changing the status here does not touch Stripe and may be overwritten by
              the next webhook.
            </p>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button size="sm" isLoading={isSubmitting} onClick={() => void saveStatus()}>
              Save status
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default AdminSubscriptionsPage;
