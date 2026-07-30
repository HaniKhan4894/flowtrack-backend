import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { KeyRound, MailCheck, MoreHorizontal, RefreshCw, ShieldCheck, Trash2, UserCog, UserX } from 'lucide-react';
import { adminService } from '../../api/adminService';
import { getApiErrorMessage } from '../../utils/apiError';
import { toastError, toastSuccess } from '../../store/toastStore';
import { beginImpersonation } from '../../utils/impersonation';
import type { AdminUserSummary, Pagination } from '../../types/admin';
import { Avatar, Badge, Button, Card } from '../../components/ui';
import { ConfirmDialog, DataTable, FilterBar, PaginationBar, SearchInput, SelectFilter } from './components/AdminUI';
import { formatDate, formatNumber, formatRelative, useDebounced } from './components/format';

const STATUS_OPTIONS = [
  { value: '', label: 'All users' },
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Deactivated' },
  { value: 'unverified', label: 'Unverified email' },
];

const ROLE_OPTIONS = [
  { value: '', label: 'Any role' },
  { value: 'owner', label: 'Owner' },
  { value: 'admin', label: 'Admin' },
  { value: 'manager', label: 'Manager' },
  { value: 'member', label: 'Member' },
];

const SORT_OPTIONS = [
  { value: 'created_at', label: 'Newest first' },
  { value: 'name', label: 'Name A–Z' },
  { value: 'email', label: 'Email A–Z' },
  { value: 'last_active', label: 'Recently active' },
];

type Pending =
  | { kind: 'deactivate' | 'delete' | 'impersonate'; user: AdminUserSummary }
  | null;

const AdminUsersPage = () => {
  const navigate = useNavigate();
  const [rows, setRows] = useState<AdminUserSummary[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [role, setRole] = useState('');
  const [superAdminOnly, setSuperAdminOnly] = useState(false);
  const [sort, setSort] = useState('created_at');
  const [page, setPage] = useState(1);

  const [pending, setPending] = useState<Pending>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<number | null>(null);

  const debouncedSearch = useDebounced(search);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await adminService.getUsers({
        search: debouncedSearch,
        status,
        role,
        super_admin: superAdminOnly ? 1 : undefined,
        sort,
        page,
        per_page: 25,
      });
      setRows(response.data ?? []);
      setPagination(response.pagination ?? null);
    } catch (e) {
      setError(getApiErrorMessage(e, 'Could not load users'));
    } finally {
      setIsLoading(false);
    }
  }, [debouncedSearch, status, role, superAdminOnly, sort, page]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, status, role, superAdminOnly, sort]);

  const quickAction = async (label: string, action: () => Promise<unknown>) => {
    try {
      await action();
      toastSuccess(label);
      void load();
    } catch (e) {
      toastError(getApiErrorMessage(e, 'Action failed'));
    }
  };

  const runPending = async (reason: string) => {
    if (!pending) return;
    setIsSubmitting(true);
    try {
      if (pending.kind === 'deactivate') {
        await adminService.setUserActive(pending.user.id, false);
        toastSuccess(`${pending.user.email} deactivated`);
        void load();
      } else if (pending.kind === 'delete') {
        await adminService.deleteUser(pending.user.id, reason);
        toastSuccess(`${pending.user.email} deleted`);
        void load();
      } else {
        const response = await adminService.impersonate(pending.user.id, { reason });
        beginImpersonation(response.data);
        toastSuccess('Impersonation started');
        window.location.assign('/app');
        return;
      }
      setPending(null);
    } catch (e) {
      toastError(getApiErrorMessage(e, 'Action failed'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-5" onClick={() => setOpenMenuId(null)}>
      <Card padding="none" className="overflow-hidden">
        <div className="p-5">
          <FilterBar>
            <SearchInput value={search} onChange={setSearch} placeholder="Search name or email…" />
            <SelectFilter value={status} onChange={setStatus} options={STATUS_OPTIONS} label="Status" />
            <SelectFilter value={role} onChange={setRole} options={ROLE_OPTIONS} label="Role" />
            <SelectFilter value={sort} onChange={setSort} options={SORT_OPTIONS} label="Sort" />
            <button
              type="button"
              onClick={() => setSuperAdminOnly((v) => !v)}
              className={
                superAdminOnly
                  ? 'inline-flex items-center gap-1.5 rounded-xl border border-amber-500/30 bg-amber-500/15 px-3 py-2.5 text-sm font-medium text-amber-300'
                  : 'inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-slate-300 hover:text-white'
              }
            >
              <ShieldCheck size={14} />
              Super admins
            </button>
            <span className="text-xs text-slate-500 ml-auto">{formatNumber(pagination?.total ?? 0)} users</span>
          </FilterBar>

          {error ? (
            <p className="text-sm text-rose-300 py-6 text-center">{error}</p>
          ) : (
            <>
              <DataTable
                rows={rows}
                isLoading={isLoading}
                rowKey={(row) => row.id}
                emptyMessage="No users match these filters."
                columns={[
                  {
                    key: 'user',
                    header: 'User',
                    render: (row) => (
                      <Link to={`/admin/users/${row.id}`} className="flex items-center gap-3 min-w-0 group">
                        <Avatar name={row.name} src={row.avatar_url} size="sm" />
                        <span className="min-w-0">
                          <span className="flex items-center gap-2">
                            <span className="text-white font-medium group-hover:text-primary-300 truncate">
                              {row.name || row.email}
                            </span>
                            {row.is_super_admin && <Badge variant="warning">Super</Badge>}
                          </span>
                          <span className="text-xs text-slate-500 block truncate">{row.email}</span>
                        </span>
                      </Link>
                    ),
                  },
                  {
                    key: 'orgs',
                    header: 'Organizations',
                    render: (row) =>
                      row.organizations.length === 0 ? (
                        <span className="text-slate-500 text-xs">none</span>
                      ) : (
                        <div className="min-w-0">
                          <span className="text-slate-200 block truncate">{row.organizations[0].name}</span>
                          {row.organization_count > 1 && (
                            <span className="text-xs text-slate-500">+{row.organization_count - 1} more</span>
                          )}
                        </div>
                      ),
                  },
                  {
                    key: 'status',
                    header: 'Status',
                    render: (row) => (
                      <div className="flex flex-wrap gap-1">
                        {row.is_active ? <Badge variant="success">Active</Badge> : <Badge variant="danger">Disabled</Badge>}
                        {!row.is_verified && <Badge variant="warning">Unverified</Badge>}
                      </div>
                    ),
                  },
                  { key: 'hours', header: 'Hours 30d', align: 'right', render: (row) => `${row.hours_30d}h` },
                  {
                    key: 'active',
                    header: 'Last active',
                    align: 'right',
                    render: (row) => <span className="text-xs text-slate-400">{formatRelative(row.last_activity_at)}</span>,
                  },
                  {
                    key: 'joined',
                    header: 'Joined',
                    align: 'right',
                    render: (row) => <span className="text-xs text-slate-400">{formatDate(row.created_at)}</span>,
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
                          aria-label={`Actions for ${row.email}`}
                        >
                          <MoreHorizontal size={16} />
                        </button>
                        {openMenuId === row.id && (
                          <div
                            className="absolute right-0 mt-1 w-56 rounded-xl border border-white/10 bg-[#12141C] shadow-xl z-30 py-1 text-left"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              onClick={() => {
                                setOpenMenuId(null);
                                navigate(`/admin/users/${row.id}`);
                              }}
                              className="w-full px-3 py-2 text-sm text-slate-300 hover:bg-white/5 hover:text-white text-left"
                            >
                              Open profile
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setOpenMenuId(null);
                                setPending({ kind: 'impersonate', user: row });
                              }}
                              className="w-full px-3 py-2 text-sm text-amber-300 hover:bg-amber-500/10 text-left flex items-center gap-2"
                            >
                              <UserCog size={14} /> Login as user
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setOpenMenuId(null);
                                void quickAction('Password reset email sent', () =>
                                  adminService.sendUserPasswordReset(row.id),
                                );
                              }}
                              className="w-full px-3 py-2 text-sm text-slate-300 hover:bg-white/5 hover:text-white text-left flex items-center gap-2"
                            >
                              <KeyRound size={14} /> Send password reset
                            </button>
                            {!row.is_verified && (
                              <button
                                type="button"
                                onClick={() => {
                                  setOpenMenuId(null);
                                  void quickAction('Email marked as verified', () => adminService.verifyUserEmail(row.id));
                                }}
                                className="w-full px-3 py-2 text-sm text-slate-300 hover:bg-white/5 hover:text-white text-left flex items-center gap-2"
                              >
                                <MailCheck size={14} /> Mark email verified
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                setOpenMenuId(null);
                                void quickAction(
                                  row.is_super_admin ? 'Super-admin access revoked' : 'Super-admin access granted',
                                  () => adminService.setSuperAdmin(row.id, !row.is_super_admin),
                                );
                              }}
                              className="w-full px-3 py-2 text-sm text-slate-300 hover:bg-white/5 hover:text-white text-left flex items-center gap-2"
                            >
                              <ShieldCheck size={14} />
                              {row.is_super_admin ? 'Revoke super admin' : 'Make super admin'}
                            </button>
                            {row.is_active ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setOpenMenuId(null);
                                  setPending({ kind: 'deactivate', user: row });
                                }}
                                className="w-full px-3 py-2 text-sm text-amber-300 hover:bg-amber-500/10 text-left flex items-center gap-2"
                              >
                                <UserX size={14} /> Deactivate account
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  setOpenMenuId(null);
                                  void quickAction('Account reactivated', () => adminService.setUserActive(row.id, true));
                                }}
                                className="w-full px-3 py-2 text-sm text-emerald-300 hover:bg-emerald-500/10 text-left"
                              >
                                Reactivate account
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                setOpenMenuId(null);
                                setPending({ kind: 'delete', user: row });
                              }}
                              className="w-full px-3 py-2 text-sm text-rose-300 hover:bg-rose-500/10 text-left flex items-center gap-2"
                            >
                              <Trash2 size={14} /> Delete user
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
        open={pending?.kind === 'deactivate'}
        title={`Deactivate ${pending?.user.email ?? ''}?`}
        description="The user is signed out of every device and cannot log in until reactivated."
        confirmLabel="Deactivate"
        isLoading={isSubmitting}
        onConfirm={runPending}
        onClose={() => setPending(null)}
      />

      <ConfirmDialog
        open={pending?.kind === 'delete'}
        title={`Delete ${pending?.user.email ?? ''}?`}
        description="Users who own an organization are soft-deleted so tenant data stays intact. Everyone else is removed completely."
        confirmLabel="Delete user"
        destructive
        requireReason
        isLoading={isSubmitting}
        onConfirm={runPending}
        onClose={() => setPending(null)}
      />

      <ConfirmDialog
        open={pending?.kind === 'impersonate'}
        title={`Log in as ${pending?.user.email ?? ''}?`}
        description="You get a 30-minute read/write session as this user. The impersonation is recorded in the audit log and you can return to your admin account at any time from the banner."
        confirmLabel="Start session"
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

export default AdminUsersPage;
