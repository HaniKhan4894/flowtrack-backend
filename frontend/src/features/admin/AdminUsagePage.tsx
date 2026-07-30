import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Activity, Camera, Clock, KeyRound, Users } from 'lucide-react';
import { adminService } from '../../api/adminService';
import { getApiErrorMessage } from '../../utils/apiError';
import type { AdminUsageOverview } from '../../types/admin';
import { Badge, PageSkeleton } from '../../components/ui';
import { DataTable, Panel, ProgressBar, SelectFilter, StatCard } from './components/AdminUI';
import { formatNumber, formatRelative } from './components/format';

const CHART_TOOLTIP = {
  background: '#12141C',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 12,
  color: '#fff',
  fontSize: 12,
} as const;

const RANGE_OPTIONS = [
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
];

const AdminUsagePage = () => {
  const [days, setDays] = useState('30');
  const [usage, setUsage] = useState<AdminUsageOverview | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await adminService.getUsage(Number(days));
      setUsage(response.data);
    } catch (e) {
      setError(getApiErrorMessage(e, 'Could not load usage analytics'));
    } finally {
      setIsLoading(false);
    }
  }, [days]);

  useEffect(() => {
    void load();
  }, [load]);

  if (isLoading) return <PageSkeleton />;
  if (error || !usage) return <p className="text-sm text-rose-300">{error ?? 'No usage data'}</p>;

  const { platform } = usage;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-white">Consumption across every tenant</h2>
          <p className="text-sm text-slate-400">
            {formatNumber(platform.active_organizations)} organizations and {formatNumber(platform.active_users)} people were
            active in this window
          </p>
        </div>
        <SelectFilter value={days} onChange={setDays} options={RANGE_OPTIONS} label="Date range" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          icon={Clock}
          label="Hours tracked"
          value={`${formatNumber(platform.hours)}h`}
          hint={`${formatNumber(platform.billable_hours)}h billable`}
        />
        <StatCard
          icon={Activity}
          label="Time entries"
          value={formatNumber(platform.time_entries)}
          hint={`${formatNumber(platform.manual_entries)} added manually`}
        />
        <StatCard
          icon={Camera}
          label="Screenshots"
          value={formatNumber(platform.screenshots)}
          hint={`${formatNumber(platform.activity_rows)} activity samples`}
        />
        <StatCard
          icon={Users}
          label="Active people"
          value={formatNumber(platform.active_users)}
          hint={`${formatNumber(platform.invoices_created)} invoices created`}
        />
      </div>

      <Panel title="When work happens" description="Time entries by hour of day, aggregated platform-wide">
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={usage.hourly_distribution} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
            <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: '#94a3b8', fontSize: 10 }} interval={1} />
            <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} width={44} unit="h" />
            <Tooltip contentStyle={CHART_TOOLTIP} formatter={(value, name) => [name === 'hours' ? `${value}h` : value, name === 'hours' ? 'Hours' : 'Entries']} />
            <Bar dataKey="hours" fill="#8b5cf6" radius={[4, 4, 0, 0]} maxBarSize={18} />
          </BarChart>
        </ResponsiveContainer>
      </Panel>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <Panel title="Top organizations" description="Ranked by hours tracked in this window">
          <DataTable
            rows={usage.top_organizations}
            rowKey={(row) => row.organization_id}
            emptyMessage="No tracked time in this window."
            columns={[
              {
                key: 'org',
                header: 'Organization',
                render: (row) => (
                  <Link to={`/admin/organizations/${row.organization_id}`} className="block min-w-0 group">
                    <span className="text-white font-medium group-hover:text-primary-300 block truncate">
                      {row.organization_name}
                    </span>
                    <span className="text-xs text-slate-500">{row.plan_name}</span>
                  </Link>
                ),
              },
              {
                key: 'hours',
                header: 'Hours',
                align: 'right',
                render: (row) => <span className="text-emerald-300 font-semibold">{row.hours}h</span>,
              },
              { key: 'users', header: 'People', align: 'right', render: (row) => formatNumber(row.active_users) },
              { key: 'entries', header: 'Entries', align: 'right', render: (row) => formatNumber(row.entries) },
              { key: 'shots', header: 'Screenshots', align: 'right', render: (row) => formatNumber(row.screenshots) },
            ]}
          />
        </Panel>

        <Panel title="Most active people" description="Highest individual usage across all tenants">
          <DataTable
            rows={usage.top_users}
            rowKey={(row) => row.user_id}
            emptyMessage="No user activity in this window."
            columns={[
              {
                key: 'user',
                header: 'User',
                render: (row) => (
                  <Link to={`/admin/users/${row.user_id}`} className="block min-w-0 group">
                    <span className="text-white font-medium group-hover:text-primary-300 block truncate">{row.name}</span>
                    <span className="text-xs text-slate-500 block truncate">{row.email}</span>
                  </Link>
                ),
              },
              { key: 'org', header: 'Organization', render: (row) => row.organization_name ?? '—' },
              {
                key: 'hours',
                header: 'Hours',
                align: 'right',
                render: (row) => <span className="text-emerald-300 font-semibold">{row.hours}h</span>,
              },
              { key: 'entries', header: 'Entries', align: 'right', render: (row) => formatNumber(row.entries) },
            ]}
          />
        </Panel>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <Panel title="Feature adoption" description="Share of organizations using each capability">
          <div className="space-y-4">
            {usage.feature_adoption.length === 0 && <p className="text-sm text-slate-500">No adoption data yet.</p>}
            {usage.feature_adoption.map((feature) => (
              <div key={feature.feature} className="space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-300">{feature.feature}</span>
                  <span className="text-slate-400 tabular-nums">
                    {formatNumber(feature.organizations)} orgs · {feature.adoption_percent}%
                  </span>
                </div>
                <ProgressBar percent={feature.adoption_percent} tone={feature.adoption_percent >= 50 ? 'emerald' : 'primary'} />
              </div>
            ))}
          </div>
        </Panel>

        <Panel
          title="API keys"
          description="Programmatic access across the platform"
          action={
            <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
              <KeyRound size={13} />
              {formatNumber(usage.api_usage.keys_active)} active of {formatNumber(usage.api_usage.keys_total)}
            </span>
          }
        >
          <p className="text-xs text-slate-500 mb-3">
            {formatNumber(usage.api_usage.keys_used_7d)} keys were used in the last 7 days.
          </p>
          <DataTable
            rows={usage.api_usage.recent_keys}
            rowKey={(row) => row.id}
            emptyMessage="No API keys created yet."
            columns={[
              {
                key: 'name',
                header: 'Key',
                render: (row) => (
                  <div className="min-w-0">
                    <span className="text-slate-200 block truncate">{row.name}</span>
                    <span className="text-[11px] text-slate-500 font-mono">{row.key_prefix}…</span>
                  </div>
                ),
              },
              { key: 'org', header: 'Organization', render: (row) => row.organization_name ?? '—' },
              {
                key: 'status',
                header: 'Status',
                render: (row) => (Number(row.is_active) === 1 ? <Badge variant="success">Active</Badge> : <Badge>Revoked</Badge>),
              },
              { key: 'used', header: 'Last used', align: 'right', render: (row) => formatRelative(row.last_used_at) },
            ]}
          />
        </Panel>
      </div>
    </div>
  );
};

export default AdminUsagePage;
