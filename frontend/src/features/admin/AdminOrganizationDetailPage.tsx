import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  ArrowLeft,
  Ban,
  CalendarPlus,
  CheckCircle2,
  Clock,
  CreditCard,
  Save,
  Trash2,
  UserCog,
} from 'lucide-react';
import { adminService } from '../../api/adminService';
import { growthService } from '../../api/growthService';
import { getApiErrorMessage } from '../../utils/apiError';
import { toastError, toastSuccess } from '../../store/toastStore';
import { beginImpersonation } from '../../utils/impersonation';
import type { AdminOrganizationDetail, AdminPlan } from '../../types/admin';
import type { OrganizationPayments } from '../../types/growth';
import { Badge, Button, Card, Modal, PageSkeleton } from '../../components/ui';
import { ConfirmDialog, DataTable, KeyValueList, Panel, StatusBadge } from './components/AdminUI';
import { formatCurrency, formatDate, formatDateTime, formatNumber, formatRelative } from './components/format';

const CHART_TOOLTIP = {
  background: '#12141C',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 12,
  color: '#fff',
  fontSize: 12,
} as const;

type Dialog = 'suspend' | 'delete' | 'plan' | 'trial' | 'settings' | null;

const AdminOrganizationDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const orgId = Number(id);
  const navigate = useNavigate();

  const [detail, setDetail] = useState<AdminOrganizationDetail | null>(null);
  const [plans, setPlans] = useState<AdminPlan[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [payments, setPayments] = useState<OrganizationPayments | null>(null);
  const [paymentsLoading, setPaymentsLoading] = useState(true);

  const [planForm, setPlanForm] = useState({ plan_id: '', billing_cycle: 'monthly', status: 'active', reason: '' });
  const [trialDays, setTrialDays] = useState('14');
  const [settingsForm, setSettingsForm] = useState({ name: '', currency: '', php_timezone: '' });

  const load = useCallback(async () => {
    if (!Number.isFinite(orgId)) return;
    setIsLoading(true);
    setError(null);
    try {
      const response = await adminService.getOrganizationDetail(orgId);
      setDetail(response.data);
      setSettingsForm({
        name: response.data.organization.name,
        currency: response.data.organization.currency ?? '',
        php_timezone: response.data.organization.php_timezone ?? '',
      });
    } catch (e) {
      setError(getApiErrorMessage(e, 'Could not load organization'));
    } finally {
      setIsLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadPayments = useCallback(async () => {
    if (!Number.isFinite(orgId)) return;
    setPaymentsLoading(true);
    try {
      const response = await growthService.getOrganizationPayments(orgId);
      setPayments(response.data);
    } catch {
      setPayments(null);
    } finally {
      setPaymentsLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    void loadPayments();
  }, [loadPayments]);

  useEffect(() => {
    adminService
      .getPlans()
      .then((response) => setPlans(response.data.plans))
      .catch(() => setPlans([]));
  }, []);

  const subscription = (detail?.subscription ?? null) as Record<string, unknown> | null;
  const subStatus = subscription?.status as string | undefined;

  const impersonate = async (userId: number) => {
    try {
      const response = await adminService.impersonate(userId, { organization_id: orgId, reason: 'Support from org detail' });
      beginImpersonation(response.data);
      toastSuccess('Impersonation started — you are now viewing as this user');
      window.location.assign('/app');
    } catch (e) {
      toastError(getApiErrorMessage(e, 'Could not start impersonation'));
    }
  };

  const toggleSuspension = async (reason: string) => {
    if (!detail) return;
    setIsSubmitting(true);
    try {
      if (detail.organization.is_active) {
        await adminService.suspendOrganization(orgId, reason);
        toastSuccess('Organization suspended');
      } else {
        await adminService.activateOrganization(orgId);
        toastSuccess('Organization reactivated');
      }
      setDialog(null);
      void load();
    } catch (e) {
      toastError(getApiErrorMessage(e, 'Could not update organization'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const removeOrganization = async (reason: string) => {
    setIsSubmitting(true);
    try {
      await adminService.deleteOrganization(orgId, reason);
      toastSuccess('Organization deleted');
      navigate('/admin/organizations', { replace: true });
    } catch (e) {
      toastError(getApiErrorMessage(e, 'Could not delete organization'));
      setIsSubmitting(false);
    }
  };

  const savePlan = async () => {
    if (!planForm.plan_id) {
      toastError('Pick a plan first');
      return;
    }
    setIsSubmitting(true);
    try {
      await adminService.changeOrganizationPlan(orgId, {
        plan_id: Number(planForm.plan_id),
        billing_cycle: planForm.billing_cycle,
        status: planForm.status,
        reason: planForm.reason || undefined,
      });
      toastSuccess('Plan updated');
      setDialog(null);
      void load();
    } catch (e) {
      toastError(getApiErrorMessage(e, 'Could not change plan'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const saveTrial = async () => {
    setIsSubmitting(true);
    try {
      await adminService.extendTrial(orgId, Number(trialDays) || 0);
      toastSuccess(`Trial extended by ${trialDays} days`);
      setDialog(null);
      void load();
    } catch (e) {
      toastError(getApiErrorMessage(e, 'Could not extend trial'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const saveSettings = async () => {
    setIsSubmitting(true);
    try {
      await adminService.updateOrganization(orgId, settingsForm);
      toastSuccess('Organization updated');
      setDialog(null);
      void load();
    } catch (e) {
      toastError(getApiErrorMessage(e, 'Could not update organization'));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) return <PageSkeleton />;

  if (error || !detail) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-rose-300">{error ?? 'Organization not found'}</p>
        <Link to="/admin/organizations">
          <Button variant="secondary" size="sm">
            <ArrowLeft size={14} className="mr-2" />
            Back to organizations
          </Button>
        </Link>
      </div>
    );
  }

  const org = detail.organization;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <Link to="/admin/organizations" className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white mb-2">
            <ArrowLeft size={13} /> All organizations
          </Link>
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-xl font-bold text-white">{org.name}</h2>
            {org.is_active ? <Badge variant="success">Active</Badge> : <Badge variant="danger">Suspended</Badge>}
            <StatusBadge status={subStatus ?? 'none'} />
          </div>
          <p className="text-sm text-slate-400 mt-1">
            {org.slug} · joined {formatDate(org.created_at)} · {org.currency} · {org.php_timezone}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={() => setDialog('settings')}>
            <Save size={14} className="mr-2" /> Edit
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setDialog('plan')}>
            <CreditCard size={14} className="mr-2" /> Change plan
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setDialog('trial')}>
            <CalendarPlus size={14} className="mr-2" /> Extend trial
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setDialog('suspend')}
            className={org.is_active ? 'text-amber-300' : 'text-emerald-300'}
          >
            {org.is_active ? (
              <>
                <Ban size={14} className="mr-2" /> Suspend
              </>
            ) : (
              <>
                <CheckCircle2 size={14} className="mr-2" /> Reactivate
              </>
            )}
          </Button>
          <Button size="sm" className="bg-rose-500 hover:bg-rose-400 shadow-none" onClick={() => setDialog('delete')}>
            <Trash2 size={14} className="mr-2" /> Delete
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {[
          { label: 'Members', value: formatNumber(detail.members.length) },
          { label: 'Projects', value: formatNumber(detail.usage.projects) },
          { label: 'Hours (all time)', value: `${detail.usage.total_hours}h` },
          { label: 'Hours (30d)', value: `${detail.usage.hours_30d}h` },
          { label: 'Screenshots', value: formatNumber(detail.usage.screenshots) },
        ].map((stat) => (
          <Card key={stat.label} className="text-center">
            <p className="text-[11px] uppercase tracking-wide text-slate-500">{stat.label}</p>
            <p className="text-lg font-bold text-white mt-1">{stat.value}</p>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <Panel title="Billing & subscription" description="Current commercial relationship">
          {subscription ? (
            <KeyValueList
              items={[
                { label: 'Plan', value: String(subscription.plan_name ?? '—') },
                { label: 'Status', value: <StatusBadge status={subStatus} /> },
                { label: 'Billing cycle', value: String(subscription.billing_cycle ?? '—') },
                { label: 'Amount', value: formatCurrency(subscription.amount as number) },
                { label: 'Seats billed', value: formatNumber(subscription.user_count as number) },
                { label: 'Period end', value: formatDate(subscription.current_period_end as string) },
                { label: 'Trial ends', value: formatDate(subscription.trial_ends_at as string) },
                {
                  label: 'Stripe',
                  value: subscription.stripe_subscription_id ? (
                    <span className="text-emerald-300">linked</span>
                  ) : (
                    <span className="text-slate-500">manual</span>
                  ),
                },
                {
                  label: 'Cancels at period end',
                  value: subscription.cancel_at_period_end ? <Badge variant="warning">Yes</Badge> : 'No',
                },
              ]}
            />
          ) : (
            <p className="text-sm text-slate-500">No subscription record. Assign a plan to start billing.</p>
          )}
        </Panel>

        <Panel title="Owner & account" description="Primary contact for this tenant">
          <KeyValueList
            items={[
              {
                label: 'Owner',
                value: detail.owner ? (
                  <Link to={`/admin/users/${detail.owner.id}`} className="text-primary-300 hover:text-primary-200">
                    {[detail.owner.first_name, detail.owner.last_name].filter(Boolean).join(' ') || detail.owner.email}
                  </Link>
                ) : (
                  '—'
                ),
              },
              { label: 'Owner email', value: detail.owner?.email ?? '—' },
              { label: 'UUID', value: <span className="font-mono text-xs">{org.uuid}</span> },
              { label: 'Clients', value: formatNumber(detail.usage.clients) },
              { label: 'Invoices', value: formatNumber(detail.usage.invoices) },
              { label: 'API keys', value: formatNumber(detail.usage.api_keys) },
              { label: 'Pending invites', value: formatNumber(detail.usage.pending_invitations) },
              { label: 'Tasks', value: formatNumber(detail.usage.tasks) },
            ]}
          />
        </Panel>
      </div>

      <Panel title="Tracked hours" description="Daily hours logged over the last 30 days">
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={detail.daily_hours} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
            <defs>
              <linearGradient id="org-hours" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#34d399" stopOpacity={0.45} />
                <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: '#94a3b8', fontSize: 11 }} interval="preserveStartEnd" minTickGap={28} />
            <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} width={40} unit="h" />
            <Tooltip contentStyle={CHART_TOOLTIP} formatter={(value) => [`${value}h`, 'Hours']} />
            <Area type="monotone" dataKey="hours" stroke="#34d399" strokeWidth={2} fill="url(#org-hours)" />
          </AreaChart>
        </ResponsiveContainer>
      </Panel>

      <Panel title={`Members (${detail.members.length})`} description="Everyone with access to this workspace">
        <DataTable
          rows={detail.members}
          rowKey={(row) => row.id}
          emptyMessage="No members."
          columns={[
            {
              key: 'user',
              header: 'Member',
              render: (row) => (
                <Link to={`/admin/users/${row.user_id}`} className="block min-w-0 group">
                  <span className="text-white font-medium group-hover:text-primary-300 block truncate">
                    {[row.first_name, row.last_name].filter(Boolean).join(' ') || row.email}
                  </span>
                  <span className="text-xs text-slate-500 block truncate">{row.email}</span>
                </Link>
              ),
            },
            { key: 'role', header: 'Role', render: (row) => <Badge variant="primary">{row.role_name ?? row.role}</Badge> },
            {
              key: 'status',
              header: 'Status',
              render: (row) =>
                row.is_active ? (
                  row.email_verified_at ? (
                    <Badge variant="success">Verified</Badge>
                  ) : (
                    <Badge variant="warning">Unverified</Badge>
                  )
                ) : (
                  <Badge variant="danger">Disabled</Badge>
                ),
            },
            { key: 'rate', header: 'Rate', align: 'right', render: (row) => (row.hourly_rate ? formatCurrency(row.hourly_rate) : '—') },
            { key: 'hours', header: 'Hours 30d', align: 'right', render: (row) => `${row.hours_30d}h` },
            { key: 'joined', header: 'Joined', align: 'right', render: (row) => formatDate(row.joined_at) },
            {
              key: 'actions',
              header: '',
              align: 'right',
              render: (row) => (
                <button
                  type="button"
                  onClick={() => void impersonate(row.user_id)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/25 text-amber-300 text-xs font-semibold hover:bg-amber-500/20"
                >
                  <UserCog size={13} /> Login as
                </button>
              ),
            },
          ]}
        />
      </Panel>

      <Panel
        title="Payment history"
        description="Invoices captured from Stripe, including refunds and failed charges"
        action={
          payments && (
            <div className="flex items-center gap-4 text-xs">
              <span className="text-slate-500">
                Lifetime value{' '}
                <span className="text-emerald-300 font-semibold">{formatCurrency(payments.totals.lifetime_value)}</span>
              </span>
              {payments.totals.refunded > 0 && (
                <span className="text-slate-500">
                  Refunded <span className="text-amber-300 font-semibold">{formatCurrency(payments.totals.refunded)}</span>
                </span>
              )}
              {payments.totals.failed_count > 0 && (
                <span className="text-rose-300 font-semibold">{payments.totals.failed_count} failed</span>
              )}
            </div>
          )
        }
      >
        <DataTable
          rows={payments?.payments ?? []}
          isLoading={paymentsLoading}
          rowKey={(row) => row.id}
          emptyMessage="No invoices recorded yet for this tenant."
          columns={[
            {
              key: 'invoice',
              header: 'Invoice',
              render: (row) =>
                row.hosted_invoice_url ? (
                  <a
                    href={row.hosted_invoice_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary-300 hover:text-primary-200"
                  >
                    {row.invoice_number ?? row.stripe_invoice_id ?? `#${row.id}`}
                  </a>
                ) : (
                  <span className="text-slate-300">{row.invoice_number ?? `#${row.id}`}</span>
                ),
            },
            { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
            {
              key: 'amount',
              header: 'Amount',
              align: 'right',
              render: (row) => (
                <div>
                  <p className="tabular-nums text-white">{formatCurrency(row.amount)}</p>
                  {row.amount_refunded > 0 && (
                    <p className="text-[11px] text-amber-300 tabular-nums">
                      −{formatCurrency(row.amount_refunded)} refunded
                    </p>
                  )}
                </div>
              ),
            },
            {
              key: 'reason',
              header: 'Reason',
              render: (row) => (
                <span className="text-xs text-slate-400">
                  {row.billing_reason ?? '—'}
                  {row.coupon_code ? ` · ${row.coupon_code}` : ''}
                </span>
              ),
            },
            {
              key: 'when',
              header: 'When',
              align: 'right',
              render: (row) => (
                <span className="text-xs text-slate-400">
                  {formatDateTime(row.paid_at ?? row.failed_at ?? row.created_at)}
                </span>
              ),
            },
          ]}
        />
      </Panel>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <Panel title="Subscription history" description="Every billing movement recorded for this tenant">
          <DataTable
            rows={detail.subscription_history}
            rowKey={(row) => row.id}
            emptyMessage="No billing history."
            columns={[
              { key: 'action', header: 'Event', render: (row) => <StatusBadge status={row.action} /> },
              {
                key: 'plan',
                header: 'Plan',
                render: (row) => (row.from_plan ? `${row.from_plan} → ${row.to_plan ?? '—'}` : (row.to_plan ?? '—')),
              },
              { key: 'amount', header: 'Amount', align: 'right', render: (row) => (row.amount ? formatCurrency(row.amount) : '—') },
              { key: 'when', header: 'When', align: 'right', render: (row) => formatDateTime(row.created_at) },
            ]}
          />
        </Panel>

        <Panel
          title="Live timers"
          description="Sessions currently running"
          action={
            <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
              <Clock size={13} /> {detail.active_sessions.length} running
            </span>
          }
        >
          <DataTable
            rows={detail.active_sessions}
            rowKey={(row) => row.id}
            emptyMessage="No timers running right now."
            columns={[
              {
                key: 'user',
                header: 'Member',
                render: (row) => [row.first_name, row.last_name].filter(Boolean).join(' ') || `User #${row.user_id}`,
              },
              { key: 'project', header: 'Project', render: (row) => row.project_name ?? '—' },
              { key: 'since', header: 'Running since', align: 'right', render: (row) => formatRelative(row.started_at) },
            ]}
          />
        </Panel>

        <Panel title="Integrations" description="Third-party connections configured by this tenant">
          <DataTable
            rows={detail.integrations}
            rowKey={(row) => row.provider}
            emptyMessage="No integrations configured."
            columns={[
              { key: 'provider', header: 'Provider', render: (row) => <span className="capitalize">{row.provider}</span> },
              {
                key: 'enabled',
                header: 'Status',
                render: (row) =>
                  Number(row.is_enabled) === 1 ? <Badge variant="success">Enabled</Badge> : <Badge>Disabled</Badge>,
              },
              { key: 'updated', header: 'Updated', align: 'right', render: (row) => formatRelative(row.updated_at) },
            ]}
          />
        </Panel>

        <Panel title="Recent activity" description="Latest audit entries for this organization">
          <DataTable
            rows={detail.audit_logs}
            rowKey={(row) => row.id}
            emptyMessage="No audit entries."
            columns={[
              { key: 'action', header: 'Action', render: (row) => <span className="font-mono text-xs">{row.action}</span> },
              {
                key: 'entity',
                header: 'Entity',
                render: (row) => (row.entity_type ? `${row.entity_type}#${row.entity_id ?? '—'}` : '—'),
              },
              {
                key: 'user',
                header: 'By',
                render: (row) => [row.first_name, row.last_name].filter(Boolean).join(' ') || 'system',
              },
              { key: 'when', header: 'When', align: 'right', render: (row) => formatRelative(row.created_at) },
            ]}
          />
        </Panel>
      </div>

      {/* Dialogs */}
      <ConfirmDialog
        open={dialog === 'suspend'}
        title={org.is_active ? `Suspend ${org.name}?` : `Reactivate ${org.name}?`}
        description={
          org.is_active
            ? 'Members lose access immediately. All data is preserved.'
            : 'Members regain access to the workspace right away.'
        }
        confirmLabel={org.is_active ? 'Suspend' : 'Reactivate'}
        destructive={org.is_active}
        isLoading={isSubmitting}
        onConfirm={toggleSuspension}
        onClose={() => setDialog(null)}
      />

      <ConfirmDialog
        open={dialog === 'delete'}
        title={`Delete ${org.name}?`}
        description="Everything belonging to this tenant is removed permanently: projects, time entries, invoices, screenshots, and members' access."
        confirmLabel="Delete forever"
        destructive
        requireReason
        isLoading={isSubmitting}
        onConfirm={removeOrganization}
        onClose={() => setDialog(null)}
      />

      <Modal open={dialog === 'plan'} onClose={() => setDialog(null)} title="Change plan" size="md">
        <div className="space-y-4">
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-slate-400">Plan</span>
            <select
              value={planForm.plan_id}
              onChange={(e) => setPlanForm({ ...planForm, plan_id: e.target.value })}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-primary-500/50"
            >
              <option value="" className="bg-[#12141C]">Select a plan…</option>
              {plans.map((plan) => (
                <option key={plan.id} value={plan.id} className="bg-[#12141C]">
                  {plan.name} — {formatCurrency(plan.price_monthly)}/mo
                </option>
              ))}
            </select>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-slate-400">Billing cycle</span>
              <select
                value={planForm.billing_cycle}
                onChange={(e) => setPlanForm({ ...planForm, billing_cycle: e.target.value })}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-primary-500/50"
              >
                <option value="monthly" className="bg-[#12141C]">Monthly</option>
                <option value="yearly" className="bg-[#12141C]">Yearly</option>
              </select>
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-slate-400">Status</span>
              <select
                value={planForm.status}
                onChange={(e) => setPlanForm({ ...planForm, status: e.target.value })}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-primary-500/50"
              >
                <option value="active" className="bg-[#12141C]">Active</option>
                <option value="trial" className="bg-[#12141C]">Trial</option>
                <option value="past_due" className="bg-[#12141C]">Past due</option>
                <option value="cancelled" className="bg-[#12141C]">Cancelled</option>
              </select>
            </label>
          </div>

          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-slate-400">Reason (audit log)</span>
            <input
              value={planForm.reason}
              onChange={(e) => setPlanForm({ ...planForm, reason: e.target.value })}
              placeholder="Sales agreement, comped account, …"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-primary-500/50"
            />
          </label>

          <p className="text-xs text-amber-300/90 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2">
            This updates FlowTrack only. Stripe subscriptions are not touched, so adjust the customer in Stripe separately if needed.
          </p>

          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setDialog(null)}>
              Cancel
            </Button>
            <Button size="sm" isLoading={isSubmitting} onClick={() => void savePlan()}>
              Apply plan
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={dialog === 'trial'} onClose={() => setDialog(null)} title="Extend trial" size="sm">
        <div className="space-y-4">
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-slate-400">Additional days</span>
            <input
              type="number"
              min={1}
              max={365}
              value={trialDays}
              onChange={(e) => setTrialDays(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-primary-500/50"
            />
          </label>
          <p className="text-xs text-slate-500">
            Extends from today when the trial already lapsed, otherwise from the current trial end date.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setDialog(null)}>
              Cancel
            </Button>
            <Button size="sm" isLoading={isSubmitting} onClick={() => void saveTrial()}>
              Extend
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={dialog === 'settings'} onClose={() => setDialog(null)} title="Edit organization" size="md">
        <div className="space-y-4">
          {[
            { key: 'name' as const, label: 'Name', placeholder: 'Acme Inc.' },
            { key: 'currency' as const, label: 'Currency', placeholder: 'USD' },
            { key: 'php_timezone' as const, label: 'Timezone', placeholder: 'UTC' },
          ].map((field) => (
            <label key={field.key} className="block space-y-1.5">
              <span className="text-xs font-medium text-slate-400">{field.label}</span>
              <input
                value={settingsForm[field.key]}
                placeholder={field.placeholder}
                onChange={(e) => setSettingsForm({ ...settingsForm, [field.key]: e.target.value })}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-primary-500/50"
              />
            </label>
          ))}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setDialog(null)}>
              Cancel
            </Button>
            <Button size="sm" isLoading={isSubmitting} onClick={() => void saveSettings()}>
              Save changes
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default AdminOrganizationDetailPage;
