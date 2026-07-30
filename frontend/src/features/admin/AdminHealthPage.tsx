import { useCallback, useEffect, useState } from 'react';
import {
  Database,
  Gauge,
  HardDrive,
  Plug,
  RefreshCw,
  ScrollText,
  Server,
  Settings2,
  Timer,
  Webhook,
} from 'lucide-react';
import { adminService } from '../../api/adminService';
import { getApiErrorMessage } from '../../utils/apiError';
import { toastError, toastSuccess } from '../../store/toastStore';
import type { AdminSystemHealth } from '../../types/admin';
import { Badge, Button, Modal, PageSkeleton } from '../../components/ui';
import { ConfirmDialog, DataTable, HealthDot, KeyValueList, Panel, ProgressBar, StatCard } from './components/AdminUI';
import { formatDateTime, formatNumber, formatRelative } from './components/format';

const AdminHealthPage = () => {
  const [health, setHealth] = useState<AdminSystemHealth | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [settingsModal, setSettingsModal] = useState(false);
  const [staleModal, setStaleModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [settingsForm, setSettingsForm] = useState({
    maintenance_mode: false,
    maintenance_message: '',
    signups_enabled: true,
    default_trial_days: '14',
    support_email: '',
  });

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await adminService.getSystemHealth();
      setHealth(response.data);
      setSettingsForm({
        maintenance_mode: response.data.settings.maintenance_mode,
        maintenance_message: response.data.settings.maintenance_message,
        signups_enabled: response.data.settings.signups_enabled,
        default_trial_days: String(response.data.settings.default_trial_days),
        support_email: response.data.settings.support_email,
      });
    } catch (e) {
      setError(getApiErrorMessage(e, 'Could not load system health'));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const saveSettings = async () => {
    setIsSubmitting(true);
    try {
      await adminService.updatePlatformSettings({
        maintenance_mode: settingsForm.maintenance_mode ? 1 : 0,
        maintenance_message: settingsForm.maintenance_message,
        signups_enabled: settingsForm.signups_enabled ? 1 : 0,
        default_trial_days: settingsForm.default_trial_days,
        support_email: settingsForm.support_email,
      });
      toastSuccess('Platform settings saved');
      setSettingsModal(false);
      void load();
    } catch (e) {
      toastError(getApiErrorMessage(e, 'Could not save settings'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const closeTimers = async () => {
    setIsSubmitting(true);
    try {
      const response = await adminService.closeStaleTimers(16);
      const closed = (response?.data as { closed?: number } | undefined)?.closed ?? 0;
      toastSuccess(`${formatNumber(closed)} stale timers closed`);
      setStaleModal(false);
      void load();
    } catch (e) {
      toastError(getApiErrorMessage(e, 'Could not close stale timers'));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) return <PageSkeleton />;
  if (error || !health) return <p className="text-sm text-rose-300">{error ?? 'No health data'}</p>;

  const diskUsedPercent =
    health.storage.disk_total_gb > 0
      ? ((health.storage.disk_total_gb - health.storage.disk_free_gb) / health.storage.disk_total_gb) * 100
      : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-white">Infrastructure status</h2>
          <p className="text-sm text-slate-400">
            Checked {formatRelative(health.checked_at)} · {health.environment.ci_environment} · PHP{' '}
            {health.environment.php_version}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => void load()}>
            <RefreshCw size={14} className="mr-2" /> Refresh
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setStaleModal(true)}>
            <Timer size={14} className="mr-2" /> Close stale timers
          </Button>
          <Button size="sm" onClick={() => setSettingsModal(true)}>
            <Settings2 size={14} className="mr-2" /> Platform settings
          </Button>
        </div>
      </div>

      {health.settings.maintenance_mode && (
        <div className="rounded-2xl border border-amber-500/25 bg-amber-500/10 px-5 py-4">
          <p className="text-sm font-semibold text-amber-200">Maintenance mode is ON</p>
          <p className="text-xs text-amber-100/80 mt-1">
            {health.settings.maintenance_message || 'No message configured for users.'}
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          icon={Database}
          label="Database"
          value={`${health.database.latency_ms} ms`}
          hint={`${health.database.driver} · ${health.database.total_size_mb} MB`}
          tone={health.database.connected ? 'positive' : 'danger'}
        />
        <StatCard
          icon={HardDrive}
          label="Disk free"
          value={`${health.storage.disk_free_gb} GB`}
          hint={`${Math.round(diskUsedPercent)}% used of ${health.storage.disk_total_gb} GB`}
          tone={diskUsedPercent > 90 ? 'danger' : diskUsedPercent > 75 ? 'warning' : 'default'}
        />
        <StatCard
          icon={Webhook}
          label="Webhook success"
          value={
            health.webhooks.available && health.webhooks.success_rate_percent !== undefined
              ? `${health.webhooks.success_rate_percent}%`
              : 'n/a'
          }
          hint={
            health.webhooks.available
              ? `${formatNumber(health.webhooks.failed_24h ?? 0)} failures in 24h`
              : 'Webhooks not installed'
          }
          tone={(health.webhooks.failed_24h ?? 0) > 0 ? 'warning' : 'positive'}
        />
        <StatCard
          icon={Timer}
          label="Stale timers"
          value={formatNumber(health.jobs.stale_timers)}
          hint={`${formatNumber(health.jobs.expired_trials_not_closed)} expired trials still open`}
          tone={Number(health.jobs.stale_timers) > 0 ? 'warning' : 'default'}
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <Panel
          title="Environment"
          description="Runtime configuration of this instance"
          action={<Server size={15} className="text-slate-400" />}
        >
          <KeyValueList
            items={[
              { label: 'CI environment', value: health.environment.ci_environment },
              { label: 'PHP version', value: health.environment.php_version },
              { label: 'Server time', value: health.environment.server_time },
              { label: 'Timezone', value: health.environment.timezone },
              { label: 'Database', value: health.database.database },
              {
                label: 'Writable path',
                value: <HealthDot ok={health.storage.writable} label={health.storage.writable ? 'writable' : 'read-only'} />,
              },
              { label: 'Log size', value: `${health.storage.log_size_mb} MB` },
              { label: 'Uploads size', value: `${health.storage.uploads_size_mb} MB` },
            ]}
          />
          <div className="mt-4 space-y-1.5">
            <div className="flex justify-between text-xs text-slate-400">
              <span>Disk usage</span>
              <span>{Math.round(diskUsedPercent)}%</span>
            </div>
            <ProgressBar percent={diskUsedPercent} tone={diskUsedPercent > 85 ? 'amber' : 'primary'} />
          </div>
        </Panel>

        <Panel
          title="Largest tables"
          description="Storage hotspots in the database"
          action={<Gauge size={15} className="text-slate-400" />}
        >
          <DataTable
            rows={health.database.largest_tables}
            rowKey={(row) => row.name}
            emptyMessage="No table statistics available."
            columns={[
              { key: 'name', header: 'Table', render: (row) => <span className="font-mono text-xs">{row.name}</span> },
              { key: 'rows', header: 'Approx rows', align: 'right', render: (row) => formatNumber(row.approx_rows) },
              { key: 'size', header: 'Size', align: 'right', render: (row) => `${row.size_mb} MB` },
            ]}
          />
        </Panel>

        <Panel
          title="Background jobs"
          description="Scheduled work and queue-like activity"
          action={<Timer size={15} className="text-slate-400" />}
        >
          <KeyValueList
            items={[
              {
                label: 'Scheduled reports',
                value: health.jobs.scheduled_reports
                  ? `${health.jobs.scheduled_reports.active} active of ${health.jobs.scheduled_reports.total}`
                  : 'not installed',
              },
              {
                label: 'Last report sent',
                value: health.jobs.scheduled_reports?.last_sent_at
                  ? formatRelative(health.jobs.scheduled_reports.last_sent_at)
                  : '—',
              },
              {
                label: 'Automations',
                value: health.jobs.automations
                  ? `${health.jobs.automations.active} active of ${health.jobs.automations.total}`
                  : 'not installed',
              },
              { label: 'Timers running > 16h', value: formatNumber(health.jobs.stale_timers) },
              { label: 'Expired trials open', value: formatNumber(health.jobs.expired_trials_not_closed) },
              { label: 'Screenshot records', value: formatNumber(health.storage.screenshot_records) },
            ]}
          />
        </Panel>

        <Panel
          title="Integrations"
          description="Platform keys and tenant connections"
          action={<Plug size={15} className="text-slate-400" />}
        >
          <div className="flex flex-wrap gap-2 mb-4">
            {Object.entries(health.integrations.configured).map(([key, configured]) => (
              <span
                key={key}
                className={
                  configured
                    ? 'inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-300'
                    : 'inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-slate-500'
                }
              >
                <span className={`h-1.5 w-1.5 rounded-full ${configured ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                {key}
              </span>
            ))}
          </div>
          <DataTable
            rows={health.integrations.per_provider}
            rowKey={(row) => row.provider}
            emptyMessage="No tenant integrations configured."
            columns={[
              { key: 'provider', header: 'Provider', render: (row) => <span className="capitalize">{row.provider}</span> },
              { key: 'orgs', header: 'Organizations', align: 'right', render: (row) => formatNumber(row.organizations) },
              { key: 'enabled', header: 'Enabled', align: 'right', render: (row) => formatNumber(row.enabled) },
            ]}
          />
        </Panel>
      </div>

      {health.webhooks.available && (
        <Panel
          title="Webhook deliveries"
          description={`${formatNumber(health.webhooks.deliveries_24h ?? 0)} attempts in the last 24 hours across ${formatNumber(
            health.webhooks.endpoints_active ?? 0,
          )} active endpoints`}
          action={<Webhook size={15} className="text-slate-400" />}
        >
          <DataTable
            rows={health.webhooks.recent_failures ?? []}
            rowKey={(row) => row.id}
            emptyMessage="No delivery failures. All endpoints healthy."
            columns={[
              { key: 'event', header: 'Event', render: (row) => <span className="font-mono text-xs">{row.event}</span> },
              { key: 'org', header: 'Organization', render: (row) => row.organization_name ?? '—' },
              { key: 'url', header: 'Endpoint', render: (row) => <span className="text-xs truncate block max-w-[220px]">{row.url ?? '—'}</span> },
              {
                key: 'status',
                header: 'Status',
                render: (row) => <Badge variant="danger">{row.status_code ?? 'error'}</Badge>,
              },
              { key: 'attempts', header: 'Attempts', align: 'right', render: (row) => formatNumber(row.attempts) },
              { key: 'when', header: 'When', align: 'right', render: (row) => formatRelative(row.created_at) },
            ]}
          />
        </Panel>
      )}

      <Panel
        title="Recent errors"
        description="Latest entries from the application log"
        action={<ScrollText size={15} className="text-slate-400" />}
      >
        {health.errors.length === 0 ? (
          <p className="text-sm text-slate-500">No errors logged recently.</p>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {health.errors.map((entry, index) => (
              <div key={`${entry.logged_at}-${index}`} className="rounded-xl border border-white/5 bg-black/25 px-4 py-3">
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant={entry.level.toLowerCase() === 'critical' ? 'danger' : 'warning'}>{entry.level}</Badge>
                  <span className="text-[11px] text-slate-500">{formatDateTime(entry.logged_at)}</span>
                </div>
                <p className="text-xs text-slate-300 break-words font-mono">{entry.message}</p>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Modal open={settingsModal} onClose={() => setSettingsModal(false)} title="Platform settings" size="md">
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setSettingsForm({ ...settingsForm, maintenance_mode: !settingsForm.maintenance_mode })}
              className={
                settingsForm.maintenance_mode
                  ? 'rounded-xl border border-amber-500/30 bg-amber-500/15 px-3 py-2 text-sm font-medium text-amber-300'
                  : 'rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-400 hover:text-white'
              }
            >
              Maintenance mode
            </button>
            <button
              type="button"
              onClick={() => setSettingsForm({ ...settingsForm, signups_enabled: !settingsForm.signups_enabled })}
              className={
                settingsForm.signups_enabled
                  ? 'rounded-xl border border-emerald-500/30 bg-emerald-500/15 px-3 py-2 text-sm font-medium text-emerald-300'
                  : 'rounded-xl border border-rose-500/30 bg-rose-500/15 px-3 py-2 text-sm font-medium text-rose-300'
              }
            >
              {settingsForm.signups_enabled ? 'Signups open' : 'Signups closed'}
            </button>
          </div>

          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-slate-400">Maintenance message</span>
            <textarea
              value={settingsForm.maintenance_message}
              onChange={(e) => setSettingsForm({ ...settingsForm, maintenance_message: e.target.value })}
              rows={3}
              placeholder="We're performing scheduled upgrades and will be back shortly."
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-primary-500/50"
            />
          </label>

          <div className="grid grid-cols-2 gap-4">
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-slate-400">Default trial days</span>
              <input
                type="number"
                value={settingsForm.default_trial_days}
                onChange={(e) => setSettingsForm({ ...settingsForm, default_trial_days: e.target.value })}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-primary-500/50"
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-slate-400">Support email</span>
              <input
                type="email"
                value={settingsForm.support_email}
                onChange={(e) => setSettingsForm({ ...settingsForm, support_email: e.target.value })}
                placeholder="support@flowtrack.app"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-primary-500/50"
              />
            </label>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setSettingsModal(false)}>
              Cancel
            </Button>
            <Button size="sm" isLoading={isSubmitting} onClick={() => void saveSettings()}>
              Save settings
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={staleModal}
        title="Close stale timers?"
        description="Any timer running longer than 16 hours is stopped and marked as auto-closed. Useful when a desktop client crashed without stopping the clock."
        confirmLabel="Close timers"
        isLoading={isSubmitting}
        onConfirm={() => void closeTimers()}
        onClose={() => setStaleModal(false)}
      />
    </div>
  );
};

export default AdminHealthPage;
