import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Ban, Building2, CheckCircle2, MoreHorizontal, RefreshCw, Trash2 } from 'lucide-react';
import { adminService } from '../../api/adminService';
import { getApiErrorMessage } from '../../utils/apiError';
import { toastError, toastSuccess } from '../../store/toastStore';
import type { AdminOrganizationSummary, Pagination } from '../../types/admin';
import { Badge, Button, Card } from '../../components/ui';
import {
  ConfirmDialog,
  DataTable,
  FilterBar,
  PaginationBar,
  SearchInput,
  SelectFilter,
  StatusBadge,
} from './components/AdminUI';
import { formatCurrency, formatDate, formatNumber, formatRelative, useDebounced } from './components/format';

const STATUS_OPTIONS = [
  { value: '', label: 'All accounts' },
  { value: 'active', label: 'Active only' },
  { value: 'suspended', label: 'Suspended only' },
];

const SUBSCRIPTION_OPTIONS = [
  { value: '', label: 'Any subscription' },
  { value: 'trial', label: 'Trialling' },
  { value: 'active', label: 'Paying' },
  { value: 'past_due', label: 'Past due' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'none', label: 'No subscription' },
];

const SORT_OPTIONS = [
  { value: 'created_at', label: 'Newest first' },
  { value: 'name', label: 'Name A–Z' },
  { value: 'members', label: 'Most members' },
  { value: 'hours', label: 'Most hours (30d)' },
  { value: 'mrr', label: 'Highest MRR' },
];

type PendingAction =
  | { kind: 'suspend'; org: AdminOrganizationSummary }
  | { kind: 'delete'; org: AdminOrganizationSummary }
  | null;

const AdminOrganizationsPage = () => {
  const navigate = useNavigate();
  const [rows, setRows] = useState<AdminOrganizationSummary[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [subscription, setSubscription] = useState('');
  const [sort, setSort] = useState('created_at');
  const [page, setPage] = useState(1);

  const [pending, setPending] = useState<PendingAction>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<number | null>(null);

  const debouncedSearch = useDebounced(search);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await adminService.getOrganizations({
        search: debouncedSearch,
        status,
        subscription_status: subscription,
        sort,
        page,
        per_page: 25,
      });
      setRows(response.data ?? []);
      setPagination(response.pagination ?? null);
    } catch (e) {
      setError(getApiErrorMessage(e, 'Could not load organizations'));
    } finally {
      setIsLoading(false);
    }
  }, [debouncedSearch, status, subscription, sort, page]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, status, subscription, sort]);

  const activate = async (org: AdminOrganizationSummary) => {
    try {
      await adminService.activateOrganization(org.id);
      toastSuccess(`${org.name} reactivated`);
      void load();
    } catch (e) {
      toastError(getApiErrorMessage(e, 'Could not activate organization'));
    }
  };

  const runPending = async (reason: string) => {
    if (!pending) return;
    setIsSubmitting(true);
    try {
      if (pending.kind === 'suspend') {
        await adminService.suspendOrganization(pending.org.id, reason);
        toastSuccess(`${pending.org.name} suspended`);
      } else {
        await adminService.deleteOrganization(pending.org.id, reason);
        toastSuccess(`${pending.org.name} deleted`);
      }
      setPending(null);
      void load();
    } catch (e) {
      toastError(getApiErrorMessage(e, 'Action failed'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const totalMrr = useMemo(() => rows.reduce((sum, row) => sum + Number(row.subscription.mrr ?? 0), 0), [rows]);

  return (
    <div className="space-y-5" onClick={() => setOpenMenuId(null)}>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="flex items-center gap-3">
          <Building2 size={18} className="text-primary-300" />
          <div>
            <p className="text-xs text-slate-500">Matching organizations</p>
            <p className="text-lg font-bold text-white">{formatNumber(pagination?.total ?? 0)}</p>
          </div>
        </Card>
        <Card className="flex items-center gap-3">
          <CheckCircle2 size={18} className="text-emerald-300" />
          <div>
            <p className="text-xs text-slate-500">MRR on this page</p>
            <p className="text-lg font-bold text-white">{formatCurrency(totalMrr)}</p>
          </div>
        </Card>
        <Card className="flex items-center gap-3">
          <RefreshCw size={18} className="text-slate-300" />
          <div>
            <p className="text-xs text-slate-500">Suspended on this page</p>
            <p className="text-lg font-bold text-white">{rows.filter((r) => !r.is_active).length}</p>
          </div>
        </Card>
      </div>

      <Card padding="none" className="overflow-hidden">
        <div className="p-5">
          <FilterBar>
            <SearchInput value={search} onChange={setSearch} placeholder="Search name, slug, or owner email…" />
            <SelectFilter value={status} onChange={setStatus} options={STATUS_OPTIONS} label="Account status" />
            <SelectFilter
              value={subscription}
              onChange={setSubscription}
              options={SUBSCRIPTION_OPTIONS}
              label="Subscription status"
            />
            <SelectFilter value={sort} onChange={setSort} options={SORT_OPTIONS} label="Sort" />
          </FilterBar>

          {error ? (
            <p className="text-sm text-rose-300 py-6 text-center">{error}</p>
          ) : (
            <>
              <DataTable
                rows={rows}
                isLoading={isLoading}
                rowKey={(row) => row.id}
                emptyMessage="No organizations match these filters."
                columns={[
                  {
                    key: 'name',
                    header: 'Organization',
                    render: (row) => (
                      <Link to={`/admin/organizations/${row.id}`} className="block min-w-0 group">
                        <span className="flex items-center gap-2">
                          <span className="text-white font-semibold group-hover:text-primary-300 truncate">{row.name}</span>
                          {!row.is_active && <Badge variant="danger">Suspended</Badge>}
                        </span>
                        <span className="text-xs text-slate-500 block truncate">
                          {row.owner.email ?? 'no owner'} · {row.slug}
                        </span>
                      </Link>
                    ),
                  },
                  {
                    key: 'plan',
                    header: 'Plan',
                    render: (row) => (
                      <div className="min-w-0">
                        <span className="text-slate-200 block truncate">{row.plan.name}</span>
                        <span className="text-xs text-slate-500">
                          {row.subscription.billing_cycle ?? '—'}
                          {row.subscription.is_stripe_linked ? ' · Stripe' : ' · manual'}
                        </span>
                      </div>
                    ),
                  },
                  {
                    key: 'status',
                    header: 'Subscription',
                    render: (row) => (
                      <div className="space-y-1">
                        <StatusBadge status={row.subscription.status ?? 'none'} />
                        {row.subscription.cancel_at_period_end && (
                          <span className="block text-[11px] text-amber-300">cancels at period end</span>
                        )}
                      </div>
                    ),
                  },
                  {
                    key: 'mrr',
                    header: 'MRR',
                    align: 'right',
                    render: (row) => <span className="text-slate-200">{formatCurrency(row.subscription.mrr)}</span>,
                  },
                  {
                    key: 'seats',
                    header: 'Members',
                    align: 'right',
                    render: (row) => (
                      <span className="text-slate-300">
                        {formatNumber(row.member_count)}
                        <span className="text-slate-600"> / {formatNumber(row.subscription.user_count)}</span>
                      </span>
                    ),
                  },
                  {
                    key: 'hours',
                    header: 'Hours 30d',
                    align: 'right',
                    render: (row) => <span className="text-slate-300">{row.hours_30d}h</span>,
                  },
                  {
                    key: 'activity',
                    header: 'Last active',
                    align: 'right',
                    render: (row) => <span className="text-slate-400 text-xs">{formatRelative(row.last_activity_at)}</span>,
                  },
                  {
                    key: 'joined',
                    header: 'Joined',
                    align: 'right',
                    render: (row) => <span className="text-slate-400 text-xs">{formatDate(row.created_at)}</span>,
                  },
                  {
                    key: 'actions',
                    header: '',
                    align: 'right',
                    render: (row) => (
                      <div className="relative inline-block text-left">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenMenuId((current) => (current === row.id ? null : row.id));
                          }}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10"
                          aria-label={`Actions for ${row.name}`}
                        >
                          <MoreHorizontal size={16} />
                        </button>
                        {openMenuId === row.id && (
                          <div
                            className="absolute right-0 mt-1 w-52 rounded-xl border border-white/10 bg-[#12141C] shadow-xl z-30 py-1 text-left"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              onClick={() => {
                                setOpenMenuId(null);
                                navigate(`/admin/organizations/${row.id}`);
                              }}
                              className="w-full px-3 py-2 text-sm text-slate-300 hover:bg-white/5 hover:text-white text-left"
                            >
                              Open detail
                            </button>
                            {row.is_active ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setOpenMenuId(null);
                                  setPending({ kind: 'suspend', org: row });
                                }}
                                className="w-full px-3 py-2 text-sm text-amber-300 hover:bg-amber-500/10 text-left flex items-center gap-2"
                              >
                                <Ban size={14} /> Suspend account
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  setOpenMenuId(null);
                                  void activate(row);
                                }}
                                className="w-full px-3 py-2 text-sm text-emerald-300 hover:bg-emerald-500/10 text-left flex items-center gap-2"
                              >
                                <CheckCircle2 size={14} /> Reactivate
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                setOpenMenuId(null);
                                setPending({ kind: 'delete', org: row });
                              }}
                              className="w-full px-3 py-2 text-sm text-rose-300 hover:bg-rose-500/10 text-left flex items-center gap-2"
                            >
                              <Trash2 size={14} /> Delete permanently
                            </button>
                          </div>
                        )}
                      </div>
                    ),
                  },
                ]}
              />
              <PaginationBar pagination={pagination} onPageChange={setPage} />
            </>
          )}
        </div>
      </Card>

      <ConfirmDialog
        open={pending?.kind === 'suspend'}
        title={`Suspend ${pending?.org.name ?? ''}?`}
        description="Members will be locked out of the workspace immediately. Data is preserved and you can reactivate at any time."
        confirmLabel="Suspend organization"
        isLoading={isSubmitting}
        onConfirm={runPending}
        onClose={() => setPending(null)}
      />

      <ConfirmDialog
        open={pending?.kind === 'delete'}
        title={`Delete ${pending?.org.name ?? ''}?`}
        description={
          <>
            This permanently removes the organization along with its projects, time entries, invoices, and screenshots.
            Consider suspending instead.
          </>
        }
        confirmLabel="Delete forever"
        destructive
        requireReason
        isLoading={isSubmitting}
        onConfirm={runPending}
        onClose={() => setPending(null)}
      />

      <div className="flex justify-end">
        <Button variant="secondary" size="sm" onClick={() => void load()}>
          <RefreshCw size={14} className="mr-2" />
          Refresh
        </Button>
      </div>
    </div>
  );
};

export default AdminOrganizationsPage;
