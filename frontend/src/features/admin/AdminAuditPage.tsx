import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, Fingerprint, KeyRound, ShieldAlert, ShieldCheck, UserCog } from 'lucide-react';
import { adminService } from '../../api/adminService';
import { getApiErrorMessage } from '../../utils/apiError';
import { toastError } from '../../store/toastStore';
import type { AdminAuditLog, AdminSecurityOverview, Pagination } from '../../types/admin';
import { Badge, Card } from '../../components/ui';
import { DataTable, FilterBar, PaginationBar, Panel, SearchInput, SelectFilter, StatCard } from './components/AdminUI';
import { formatDateTime, formatNumber, useDebounced } from './components/format';

const SCOPE_OPTIONS = [
  { value: 'all', label: 'All activity' },
  { value: 'platform', label: 'Super-admin actions' },
  { value: 'organization', label: 'Tenant activity' },
];

interface ImpersonationRow {
  id: number;
  admin_email: string | null;
  target_email: string | null;
  organization_name: string | null;
  reason: string | null;
  ip_address: string | null;
  created_at: string;
  ended_at: string | null;
  expires_at: string | null;
}

const AdminAuditPage = () => {
  const [logs, setLogs] = useState<AdminAuditLog[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const [security, setSecurity] = useState<AdminSecurityOverview | null>(null);
  const [impersonations, setImpersonations] = useState<ImpersonationRow[]>([]);
  const [options, setOptions] = useState<{ actions: string[]; entity_types: string[] }>({
    actions: [],
    entity_types: [],
  });

  const [scope, setScope] = useState('platform');
  const [search, setSearch] = useState('');
  const [action, setAction] = useState('');
  const [entityType, setEntityType] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebounced(search);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await adminService.getAuditLogs({
        scope,
        search: debouncedSearch,
        action,
        entity_type: entityType,
        start_date: startDate,
        end_date: endDate,
        page,
        per_page: 50,
      });
      setLogs(response.data ?? []);
      setPagination(response.pagination ?? null);
    } catch (e) {
      setError(getApiErrorMessage(e, 'Could not load audit log'));
    } finally {
      setIsLoading(false);
    }
  }, [scope, debouncedSearch, action, entityType, startDate, endDate, page]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [scope, debouncedSearch, action, entityType, startDate, endDate]);

  useEffect(() => {
    adminService
      .getSecurityOverview()
      .then((response) => setSecurity(response.data))
      .catch((e) => toastError(getApiErrorMessage(e, 'Could not load security overview')));

    adminService
      .getAuditOptions()
      .then((response) => setOptions(response.data))
      .catch(() => undefined);

    adminService
      .getImpersonationHistory(25)
      .then((response) => setImpersonations((response.data ?? []) as ImpersonationRow[]))
      .catch(() => undefined);
  }, []);

  return (
    <div className="space-y-6">
      {security && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <StatCard
            icon={ShieldAlert}
            label="Admin actions (7d)"
            value={formatNumber(security.platform_actions_7d)}
            hint="Writes performed from this portal"
            tone="warning"
          />
          <StatCard
            icon={UserCog}
            label="Impersonations (30d)"
            value={formatNumber(security.impersonations_30d)}
            hint="Support sessions started"
          />
          <StatCard
            icon={KeyRound}
            label="Active sessions"
            value={formatNumber(security.sessions_active)}
            hint={`${formatNumber(security.sessions_created_24h)} created in 24h`}
          />
          <StatCard
            icon={ShieldCheck}
            label="Users with 2FA"
            value={formatNumber(security.users_with_2fa)}
            hint="Accounts with second factor enabled"
            tone="positive"
          />
        </div>
      )}

      <Card padding="none">
        <div className="p-5">
          <FilterBar>
            <SearchInput value={search} onChange={setSearch} placeholder="Search action, entity, email, or payload…" />
            <SelectFilter value={scope} onChange={setScope} options={SCOPE_OPTIONS} label="Scope" />
            <SelectFilter
              value={action}
              onChange={setAction}
              label="Action"
              options={[{ value: '', label: 'Any action' }, ...options.actions.map((a) => ({ value: a, label: a }))]}
            />
            <SelectFilter
              value={entityType}
              onChange={setEntityType}
              label="Entity"
              options={[
                { value: '', label: 'Any entity' },
                ...options.entity_types.map((e) => ({ value: e, label: e })),
              ]}
            />
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              aria-label="From date"
              className="bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-primary-500/50"
            />
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              aria-label="To date"
              className="bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-primary-500/50"
            />
          </FilterBar>

          {error ? (
            <p className="text-sm text-rose-300 py-6 text-center">{error}</p>
          ) : (
            <>
              <DataTable
                rows={logs}
                isLoading={isLoading}
                rowKey={(row) => row.id}
                emptyMessage="No audit entries match these filters."
                onRowClick={(row) => setExpandedId((current) => (current === row.id ? null : row.id))}
                columns={[
                  {
                    key: 'action',
                    header: 'Action',
                    render: (row) => (
                      <span className="flex items-center gap-2 min-w-0">
                        <ChevronDown
                          size={13}
                          className={expandedId === row.id ? 'text-slate-300 rotate-0' : 'text-slate-600 -rotate-90'}
                        />
                        <span className="font-mono text-xs text-white truncate">{row.action}</span>
                        {row.is_platform_action && <Badge variant="warning">platform</Badge>}
                      </span>
                    ),
                  },
                  {
                    key: 'who',
                    header: 'Actor',
                    render: (row) =>
                      row.user_id ? (
                        <Link to={`/admin/users/${row.user_id}`} className="block min-w-0 hover:text-primary-300">
                          <span className="text-slate-200 block truncate">{row.user_name ?? row.user_email}</span>
                          <span className="text-[11px] text-slate-500 block truncate">{row.user_email}</span>
                        </Link>
                      ) : (
                        <span className="text-slate-500">system</span>
                      ),
                  },
                  {
                    key: 'org',
                    header: 'Organization',
                    render: (row) =>
                      row.organization_id ? (
                        <Link to={`/admin/organizations/${row.organization_id}`} className="text-slate-300 hover:text-primary-300">
                          {row.organization_name ?? `#${row.organization_id}`}
                        </Link>
                      ) : (
                        <span className="text-slate-600">—</span>
                      ),
                  },
                  {
                    key: 'entity',
                    header: 'Entity',
                    render: (row) => (
                      <span className="text-xs text-slate-400">
                        {row.entity_type ? `${row.entity_type}#${row.entity_id ?? '—'}` : '—'}
                      </span>
                    ),
                  },
                  {
                    key: 'ip',
                    header: 'IP',
                    render: (row) => <span className="font-mono text-[11px] text-slate-500">{row.ip_address ?? '—'}</span>,
                  },
                  {
                    key: 'when',
                    header: 'When',
                    align: 'right',
                    render: (row) => <span className="text-xs text-slate-400">{formatDateTime(row.created_at)}</span>,
                  },
                ]}
              />

              {expandedId !== null && (
                <div className="mt-3 rounded-xl border border-white/10 bg-black/30 p-4">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-2">Change payload</p>
                  <pre className="text-xs text-slate-300 whitespace-pre-wrap break-words max-h-72 overflow-y-auto">
                    {JSON.stringify(logs.find((log) => log.id === expandedId)?.changes ?? null, null, 2)}
                  </pre>
                </div>
              )}

              <PaginationBar pagination={pagination} onPageChange={setPage} />
            </>
          )}
        </div>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <Panel
          title="Impersonation sessions"
          description="Support logins performed by super admins"
          action={<Fingerprint size={15} className="text-amber-300" />}
        >
          <DataTable
            rows={impersonations}
            rowKey={(row) => row.id}
            emptyMessage="No impersonation sessions recorded."
            columns={[
              { key: 'admin', header: 'Admin', render: (row) => <span className="text-slate-200">{row.admin_email ?? '—'}</span> },
              { key: 'target', header: 'Acted as', render: (row) => row.target_email ?? '—' },
              { key: 'org', header: 'Organization', render: (row) => row.organization_name ?? '—' },
              { key: 'reason', header: 'Reason', render: (row) => <span className="text-xs">{row.reason ?? '—'}</span> },
              { key: 'started', header: 'Started', align: 'right', render: (row) => formatDateTime(row.created_at) },
              {
                key: 'ended',
                header: 'Ended',
                align: 'right',
                render: (row) => (row.ended_at ? formatDateTime(row.ended_at) : <Badge variant="warning">Open</Badge>),
              },
            ]}
          />
        </Panel>

        <Panel title="Most active admins" description="Super admins by platform actions in the last 30 days">
          <DataTable
            rows={security?.top_admins_30d ?? []}
            rowKey={(row) => row.id}
            emptyMessage="No admin activity recorded."
            columns={[
              {
                key: 'admin',
                header: 'Admin',
                render: (row) => (
                  <Link to={`/admin/users/${row.id}`} className="text-slate-200 hover:text-primary-300">
                    {row.email}
                  </Link>
                ),
              },
              {
                key: 'actions',
                header: 'Actions',
                align: 'right',
                render: (row) => <span className="text-white font-semibold">{formatNumber(row.actions)}</span>,
              },
            ]}
          />
        </Panel>
      </div>
    </div>
  );
};

export default AdminAuditPage;
