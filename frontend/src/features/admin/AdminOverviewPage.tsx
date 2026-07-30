import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  LabelList,
  Legend,
  Line,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Activity,
  AlertTriangle,
  Building2,
  Clock,
  CreditCard,
  DollarSign,
  Flame,
  HeartPulse,
  Radio,
  Repeat,
  ShieldAlert,
  TrendingDown,
  TrendingUp,
  UserPlus,
  Users,
} from 'lucide-react';
import { adminService } from '../../api/adminService';
import { growthService } from '../../api/growthService';
import { getApiErrorMessage } from '../../utils/apiError';
import type { AdminOverview } from '../../types/admin';
import type { ChurnReport, GrowthOverview, HealthReport, RevenueReport } from '../../types/growth';
import { Badge, Button, Card, Skeleton } from '../../components/ui';
import { DataTable, Panel, SelectFilter, StatCard, StatCardSkeleton, StatusBadge } from './components/AdminUI';
import { formatCurrency, formatDate, formatMonthShort, formatNumber, formatRelative } from './components/format';

const CHART_TOOLTIP = {
  background: '#12141C',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 12,
  color: '#fff',
  fontSize: 12,
} as const;

const PLAN_COLORS = ['#8b5cf6', '#38bdf8', '#34d399', '#fbbf24', '#f472b6', '#f87171'];

const HEALTH_COLORS: Record<string, string> = {
  Healthy: '#34d399',
  Watch: '#fbbf24',
  'At risk': '#f87171',
};

const currencyTooltip = (value: unknown): string => formatCurrency(Number(value));

const RANGE_OPTIONS = [
  { value: '14', label: 'Last 14 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
];

const AdminOverviewPage = () => {
  const [days, setDays] = useState('30');
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await adminService.getOverview(Number(days));
      setOverview(response.data);
    } catch (e) {
      setError(getApiErrorMessage(e, 'Could not load platform metrics'));
    } finally {
      setIsLoading(false);
    }
  }, [days]);

  useEffect(() => {
    void load();
  }, [load]);

  /* The revenue/retention deep-dive loads separately so the headline KPIs
     never wait on the heavier analytics queries. */
  const [revenueReport, setRevenueReport] = useState<RevenueReport | null>(null);
  const [churnReport, setChurnReport] = useState<ChurnReport | null>(null);
  const [growthReport, setGrowthReport] = useState<GrowthOverview | null>(null);
  const [healthReport, setHealthReport] = useState<HealthReport | null>(null);
  const [deepDiveLoading, setDeepDiveLoading] = useState(true);

  const loadDeepDive = useCallback(async () => {
    setDeepDiveLoading(true);
    const [revenueRes, churnRes, growthRes, healthRes] = await Promise.all([
      growthService.getRevenueReport(12).catch(() => null),
      growthService.getChurnReport(12).catch(() => null),
      growthService.getGrowthOverview(90).catch(() => null),
      growthService.getHealthScores(40).catch(() => null),
    ]);

    setRevenueReport(revenueRes?.data ?? null);
    setChurnReport(churnRes?.data ?? null);
    setGrowthReport(growthRes?.data ?? null);
    setHealthReport(healthRes?.data ?? null);
    setDeepDiveLoading(false);
  }, []);

  useEffect(() => {
    void loadDeepDive();
  }, [loadDeepDive]);

  const revenueTrend = useMemo(
    () => (revenueReport?.trend ?? []).map((row) => ({ ...row, label: formatMonthShort(row.month) })),
    [revenueReport],
  );

  const mrrMovement = useMemo(
    () =>
      (churnReport?.churn.trend ?? []).map((row) => ({
        label: formatMonthShort(row.month),
        added: Number(row.mrr_added),
        lost: -Math.abs(Number(row.mrr_lost)),
        net: Number(row.net_mrr),
        churned: Number(row.churned),
        started: Number(row.started),
      })),
    [churnReport],
  );

  const retentionTrend = useMemo(
    () =>
      (churnReport?.revenue_movement ?? []).map((row) => ({
        label: formatMonthShort(row.month),
        nrr: Number(row.net_retention_percent),
        grr: Number(row.gross_retention_percent),
      })),
    [churnReport],
  );

  const funnelStages = growthReport?.funnel.stages ?? [];
  const engagementBuckets = growthReport?.engagement ?? [];
  const tenureBuckets = churnReport?.churn.tenure_buckets ?? [];
  const planRevenue = revenueReport?.by_plan ?? [];

  const healthSlices = useMemo(() => {
    const bands = healthReport?.bands;
    if (!bands) return [];
    return [
      { name: 'Healthy', value: bands.healthy },
      { name: 'Watch', value: bands.watch },
      { name: 'At risk', value: bands.at_risk },
    ].filter((slice) => slice.value > 0);
  }, [healthReport]);

  const latestRetention = retentionTrend.at(-1) ?? null;

  const metrics = overview?.metrics;

  const planPieData = useMemo(
    () =>
      (metrics?.plan_distribution ?? [])
        .map((plan) => ({ name: plan.name, value: Number(plan.active_accounts) + Number(plan.trial_accounts) }))
        .filter((slice) => slice.value > 0),
    [metrics],
  );

  if (error) {
    return (
      <div className="rounded-2xl border border-rose-500/25 bg-rose-500/10 px-5 py-4 text-sm text-rose-100">
        {error}
      </div>
    );
  }

  if (isLoading || !metrics) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <StatCardSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  const { totals, revenue, growth, churn, engagement, attention } = metrics;

  return (
    <div className="space-y-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-white">Platform health at a glance</h2>
          <p className="text-sm text-slate-400">
            {formatNumber(totals.organizations)} organizations · {formatNumber(totals.users)} users ·{' '}
            {formatNumber(engagement.live_sessions)} live timers right now
          </p>
        </div>
        <SelectFilter value={days} onChange={setDays} options={RANGE_OPTIONS} label="Date range" />
      </div>

      {/* Revenue + growth KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          icon={DollarSign}
          label="MRR"
          value={formatCurrency(revenue.mrr)}
          hint={`${formatNumber(revenue.paying_accounts)} paying accounts · ${formatCurrency(revenue.arpa)} ARPA`}
          tone="positive"
        />
        <StatCard
          icon={CreditCard}
          label="ARR"
          value={formatCurrency(revenue.arr)}
          hint={`${formatNumber(revenue.billed_seats)} billed seats`}
          tone="positive"
        />
        <StatCard
          icon={Building2}
          label="Organizations"
          value={formatNumber(totals.organizations)}
          hint={`${formatNumber(growth.organizations.current)} new in 30d · ${formatNumber(totals.organizations_suspended)} suspended`}
          changePercent={growth.organizations.change_percent}
        />
        <StatCard
          icon={Users}
          label="Users"
          value={formatNumber(totals.users)}
          hint={`${formatNumber(growth.users.current)} new in 30d · ${formatNumber(totals.users_unverified)} unverified`}
          changePercent={growth.users.change_percent}
        />
        <StatCard
          icon={Flame}
          label="Trial pipeline"
          value={formatCurrency(revenue.trial_pipeline_mrr)}
          hint={`${formatNumber(revenue.trial_accounts)} trials · ${churn.trial_conversion_percent}% convert`}
          tone="warning"
        />
        <StatCard
          icon={TrendingDown}
          label="Churn (30d)"
          value={`${churn.churn_rate_percent}%`}
          hint={`${formatNumber(churn.cancelled_30d)} cancelled · ${formatNumber(churn.pending_cancellations)} pending`}
          tone={churn.churn_rate_percent > 5 ? 'danger' : 'default'}
        />
        <StatCard
          icon={AlertTriangle}
          label="Past due"
          value={formatCurrency(revenue.past_due_mrr)}
          hint={`${formatNumber(revenue.past_due_accounts)} accounts need attention`}
          tone={revenue.past_due_accounts > 0 ? 'danger' : 'default'}
        />
        <StatCard
          icon={Radio}
          label="Active users"
          value={`${formatNumber(engagement.dau)} / ${formatNumber(engagement.mau)}`}
          hint={`DAU/MAU stickiness ${engagement.stickiness_percent}%`}
        />
      </div>

      {/* Growth chart */}
      <Panel
        title="Signups & tenant growth"
        description={`New users and organizations per day over the last ${days} days`}
      >
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={overview?.timeseries ?? []} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
            <defs>
              <linearGradient id="admin-signups" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.45} />
                <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="admin-orgs" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.45} />
                <stop offset="100%" stopColor="#38bdf8" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: '#94a3b8', fontSize: 11 }} interval="preserveStartEnd" minTickGap={28} />
            <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} width={40} allowDecimals={false} />
            <Tooltip contentStyle={CHART_TOOLTIP} />
            <Legend wrapperStyle={{ fontSize: 12, color: '#94a3b8' }} />
            <Area type="monotone" dataKey="signups" name="New users" stroke="#8b5cf6" strokeWidth={2} fill="url(#admin-signups)" />
            <Area type="monotone" dataKey="organizations" name="New orgs" stroke="#38bdf8" strokeWidth={2} fill="url(#admin-orgs)" />
          </AreaChart>
        </ResponsiveContainer>
      </Panel>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <Panel
          title="Product usage"
          description="Hours tracked and daily active users"
          className="xl:col-span-2"
        >
          <ResponsiveContainer width="100%" height={240}>
            <ComposedChart data={overview?.timeseries ?? []} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
              <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: '#94a3b8', fontSize: 11 }} interval="preserveStartEnd" minTickGap={28} />
              <YAxis yAxisId="left" tick={{ fill: '#94a3b8', fontSize: 11 }} width={44} unit="h" />
              <YAxis yAxisId="right" orientation="right" tick={{ fill: '#94a3b8', fontSize: 11 }} width={34} allowDecimals={false} />
              <Tooltip contentStyle={CHART_TOOLTIP} />
              <Legend wrapperStyle={{ fontSize: 12, color: '#94a3b8' }} />
              <Bar yAxisId="left" dataKey="hours" name="Hours tracked" fill="#34d399" radius={[4, 4, 0, 0]} maxBarSize={22} />
              <Line yAxisId="right" type="monotone" dataKey="active_users" name="Active users" stroke="#fbbf24" strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </Panel>

        <Panel title="Plan mix" description="Active and trialling accounts per plan">
          {planPieData.length === 0 ? (
            <p className="text-sm text-slate-500 py-10 text-center">No subscriptions yet.</p>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={190}>
                <PieChart>
                  <Pie data={planPieData} dataKey="value" nameKey="name" innerRadius={48} outerRadius={78} paddingAngle={3}>
                    {planPieData.map((entry, index) => (
                      <Cell key={entry.name} fill={PLAN_COLORS[index % PLAN_COLORS.length]} stroke="none" />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={CHART_TOOLTIP} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2 mt-2">
                {metrics.plan_distribution.map((plan, index) => (
                  <div key={plan.id} className="flex items-center justify-between gap-3 text-sm">
                    <span className="flex items-center gap-2 min-w-0">
                      <span
                        className="h-2 w-2 rounded-full shrink-0"
                        style={{ background: PLAN_COLORS[index % PLAN_COLORS.length] }}
                      />
                      <span className="text-slate-300 truncate">{plan.name}</span>
                    </span>
                    <span className="text-slate-400 tabular-nums shrink-0">
                      {formatNumber(plan.active_accounts)} · {formatCurrency(plan.mrr)}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </Panel>
      </div>

      {/* Revenue & retention deep-dive */}
      <div className="flex flex-wrap items-end justify-between gap-3 pt-1">
        <div>
          <h2 className="text-lg font-bold text-white">Revenue & retention</h2>
          <p className="text-sm text-slate-400">
            Cash collected, MRR movement, and where accounts are drifting away
          </p>
        </div>
        <Link to="/admin/growth">
          <Button variant="secondary" size="sm">
            <TrendingUp size={14} className="mr-2" />
            Full growth report
          </Button>
        </Link>
      </div>

      {deepDiveLoading ? (
        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <StatCardSkeleton key={i} />
            ))}
          </div>
          {Array.from({ length: 2 }).map((_, i) => (
            <Card key={i} className="space-y-3">
              <Skeleton className="h-3 w-40" />
              <Skeleton className="h-52 w-full rounded-2xl" />
            </Card>
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <StatCard
              icon={DollarSign}
              label="Collected (30d)"
              value={formatCurrency(growthReport?.metrics.collected_30d ?? 0)}
              hint={`${formatCurrency(growthReport?.metrics.lifetime_revenue ?? 0)} lifetime`}
              changePercent={growthReport?.metrics.collected_growth_percent ?? undefined}
              tone="positive"
            />
            <StatCard
              icon={Repeat}
              label="Net revenue retention"
              value={latestRetention ? `${latestRetention.nrr}%` : '—'}
              hint={latestRetention ? `${latestRetention.grr}% gross retention` : 'Needs two months of history'}
              tone={latestRetention && latestRetention.nrr >= 100 ? 'positive' : 'warning'}
            />
            <StatCard
              icon={ShieldAlert}
              label="MRR at risk"
              value={formatCurrency(healthReport?.mrr_at_risk ?? 0)}
              hint={`${formatNumber(healthReport?.bands.at_risk ?? 0)} accounts scored at risk`}
              tone={(healthReport?.mrr_at_risk ?? 0) > 0 ? 'danger' : 'default'}
            />
            <StatCard
              icon={Activity}
              label="Campaign revenue"
              value={formatCurrency(growthReport?.metrics.campaigns.attributed_revenue ?? 0)}
              hint={`${formatNumber(growthReport?.metrics.campaigns.emails_sent ?? 0)} emails · ${formatNumber(
                growthReport?.metrics.campaigns.conversions ?? 0,
              )} conversions`}
            />
          </div>

          <Panel
            title="Cash collected by month"
            description="New business, renewals and expansion stacked against net collected and refunds"
          >
            {revenueTrend.length === 0 ? (
              <p className="text-sm text-slate-500 py-10 text-center">
                No invoices captured yet. Run <code className="text-slate-300">php spark stripe:backfill-payments</code>{' '}
                to import your Stripe history.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <ComposedChart data={revenueTrend} margin={{ top: 8, right: 12, bottom: 0, left: -8 }}>
                  <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                  <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} width={64} tickFormatter={currencyTooltip} />
                  <Tooltip contentStyle={CHART_TOOLTIP} formatter={currencyTooltip} />
                  <Legend wrapperStyle={{ fontSize: 12, color: '#94a3b8' }} />
                  <Bar dataKey="new_business" name="New business" stackId="rev" fill="#8b5cf6" maxBarSize={34} />
                  <Bar dataKey="renewals" name="Renewals" stackId="rev" fill="#38bdf8" maxBarSize={34} />
                  <Bar
                    dataKey="expansion"
                    name="Expansion"
                    stackId="rev"
                    fill="#34d399"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={34}
                  />
                  <Line type="monotone" dataKey="net" name="Net collected" stroke="#fbbf24" strokeWidth={2} dot={false} />
                  <Line
                    type="monotone"
                    dataKey="refunded"
                    name="Refunded"
                    stroke="#f87171"
                    strokeWidth={2}
                    strokeDasharray="4 3"
                    dot={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </Panel>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            <Panel title="MRR movement" description="Recurring revenue won versus lost each month">
              {mrrMovement.length === 0 ? (
                <p className="text-sm text-slate-500 py-10 text-center">No subscription movement recorded yet.</p>
              ) : (
                <ResponsiveContainer width="100%" height={250}>
                  <ComposedChart data={mrrMovement} margin={{ top: 8, right: 12, bottom: 0, left: -8 }} stackOffset="sign">
                    <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                    <XAxis dataKey="label" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                    <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} width={62} tickFormatter={currencyTooltip} />
                    <Tooltip contentStyle={CHART_TOOLTIP} formatter={currencyTooltip} />
                    <Legend wrapperStyle={{ fontSize: 12, color: '#94a3b8' }} />
                    <ReferenceLine y={0} stroke="rgba(255,255,255,0.25)" />
                    <Bar dataKey="added" name="MRR added" stackId="mrr" fill="#34d399" maxBarSize={30} />
                    <Bar dataKey="lost" name="MRR churned" stackId="mrr" fill="#f87171" maxBarSize={30} />
                    <Line type="monotone" dataKey="net" name="Net MRR" stroke="#8b5cf6" strokeWidth={2} dot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              )}
            </Panel>

            <Panel
              title="Revenue retention"
              description="Net keeps expansion, gross does not — above 100% means growth without new sales"
            >
              {retentionTrend.length === 0 ? (
                <p className="text-sm text-slate-500 py-10 text-center">Needs at least two months of revenue.</p>
              ) : (
                <ResponsiveContainer width="100%" height={250}>
                  <AreaChart data={retentionTrend} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
                    <defs>
                      <linearGradient id="admin-nrr" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#34d399" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                    <XAxis dataKey="label" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                    <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} width={44} unit="%" />
                    <Tooltip contentStyle={CHART_TOOLTIP} formatter={(v) => `${Number(v)}%`} />
                    <Legend wrapperStyle={{ fontSize: 12, color: '#94a3b8' }} />
                    <ReferenceLine y={100} stroke="rgba(255,255,255,0.25)" strokeDasharray="4 3" />
                    <Area
                      type="monotone"
                      dataKey="nrr"
                      name="Net retention"
                      stroke="#34d399"
                      strokeWidth={2}
                      fill="url(#admin-nrr)"
                    />
                    <Area
                      type="monotone"
                      dataKey="grr"
                      name="Gross retention"
                      stroke="#38bdf8"
                      strokeWidth={2}
                      fillOpacity={0}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </Panel>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
            <Panel title="Signup → paid funnel" description="Last 90 days, share of every signup">
              {funnelStages.length === 0 ? (
                <p className="text-sm text-slate-500 py-10 text-center">No signups in this window.</p>
              ) : (
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart
                    data={funnelStages}
                    layout="vertical"
                    margin={{ top: 4, right: 40, bottom: 0, left: 8 }}
                  >
                    <CartesianGrid stroke="rgba(255,255,255,0.05)" horizontal={false} />
                    <XAxis type="number" hide />
                    <YAxis
                      type="category"
                      dataKey="label"
                      tick={{ fill: '#94a3b8', fontSize: 11 }}
                      width={104}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip
                      contentStyle={CHART_TOOLTIP}
                      formatter={(value, _name, item) => [
                        `${formatNumber(Number(value))} (${item?.payload?.percent_of_signups ?? 0}% of signups)`,
                        'Accounts',
                      ]}
                    />
                    <Bar dataKey="count" fill="#8b5cf6" radius={[0, 6, 6, 0]} maxBarSize={22}>
                      <LabelList dataKey="count" position="right" fill="#cbd5e1" fontSize={11} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Panel>

            <Panel title="Account health" description="Scored on usage, seat adoption and payment history">
              {healthSlices.length === 0 ? (
                <p className="text-sm text-slate-500 py-10 text-center">No scored accounts yet.</p>
              ) : (
                <>
                  <ResponsiveContainer width="100%" height={180}>
                    <PieChart>
                      <Pie
                        data={healthSlices}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={46}
                        outerRadius={74}
                        paddingAngle={3}
                      >
                        {healthSlices.map((slice) => (
                          <Cell key={slice.name} fill={HEALTH_COLORS[slice.name]} stroke="none" />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={CHART_TOOLTIP} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="space-y-2 mt-1">
                    {healthSlices.map((slice) => (
                      <div key={slice.name} className="flex items-center justify-between gap-3 text-sm">
                        <span className="flex items-center gap-2">
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{ background: HEALTH_COLORS[slice.name] }}
                          />
                          <span className="text-slate-300">{slice.name}</span>
                        </span>
                        <span className="text-slate-400 tabular-nums">{formatNumber(slice.value)}</span>
                      </div>
                    ))}
                    <Link
                      to="/admin/growth"
                      className="inline-flex items-center gap-1.5 text-xs text-primary-300 hover:text-primary-200 pt-1"
                    >
                      <HeartPulse size={12} />
                      Review at-risk accounts
                    </Link>
                  </div>
                </>
              )}
            </Panel>

            <Panel title="Engagement spread" description="Organizations grouped by hours tracked in 30 days">
              {engagementBuckets.length === 0 ? (
                <p className="text-sm text-slate-500 py-10 text-center">No usage recorded yet.</p>
              ) : (
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={engagementBuckets} margin={{ top: 8, right: 12, bottom: 0, left: -24 }}>
                    <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                    <XAxis dataKey="bucket" tick={{ fill: '#94a3b8', fontSize: 10 }} interval={0} />
                    <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} width={40} allowDecimals={false} />
                    <Tooltip contentStyle={CHART_TOOLTIP} />
                    <Bar dataKey="count" name="Organizations" fill="#38bdf8" radius={[4, 4, 0, 0]} maxBarSize={38} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Panel>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            <Panel title="Revenue by plan" description="Collected across the last 12 months">
              {planRevenue.length === 0 ? (
                <p className="text-sm text-slate-500 py-10 text-center">No plan revenue captured yet.</p>
              ) : (
                <ResponsiveContainer width="100%" height={230}>
                  <BarChart data={planRevenue} margin={{ top: 8, right: 12, bottom: 0, left: -8 }}>
                    <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                    <XAxis dataKey="plan_name" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                    <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} width={64} tickFormatter={currencyTooltip} />
                    <Tooltip contentStyle={CHART_TOOLTIP} formatter={currencyTooltip} />
                    <Bar dataKey="revenue" name="Collected" radius={[4, 4, 0, 0]} maxBarSize={44}>
                      {planRevenue.map((row, index) => (
                        <Cell key={row.plan_name} fill={PLAN_COLORS[index % PLAN_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Panel>

            <Panel title="How long churned accounts stayed" description="Tenure at the moment they cancelled">
              {tenureBuckets.length === 0 ? (
                <p className="text-sm text-slate-500 py-10 text-center">No cancellations recorded. Keep it that way.</p>
              ) : (
                <ResponsiveContainer width="100%" height={230}>
                  <BarChart data={tenureBuckets} margin={{ top: 8, right: 12, bottom: 0, left: -24 }}>
                    <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                    <XAxis dataKey="label" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                    <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} width={40} allowDecimals={false} />
                    <Tooltip contentStyle={CHART_TOOLTIP} />
                    <Bar dataKey="count" name="Accounts" fill="#f472b6" radius={[4, 4, 0, 0]} maxBarSize={44} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Panel>
          </div>
        </>
      )}

      {/* Attention lists */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <Panel
          title="Trials expiring in 7 days"
          description="Reach out before the window closes"
          action={
            <Link to="/admin/subscriptions?status=trial">
              <Button variant="secondary" size="sm">View all</Button>
            </Link>
          }
        >
          <DataTable
            rows={attention.trials_expiring}
            rowKey={(row) => row.id}
            emptyMessage="No trials expiring this week."
            columns={[
              {
                key: 'org',
                header: 'Organization',
                render: (row) => (
                  <Link to={`/admin/organizations/${row.organization_id}`} className="text-white font-medium hover:text-primary-300">
                    {row.organization_name}
                  </Link>
                ),
              },
              { key: 'plan', header: 'Plan', render: (row) => row.plan_name ?? '—' },
              { key: 'seats', header: 'Seats', align: 'right', render: (row) => formatNumber(row.user_count) },
              {
                key: 'ends',
                header: 'Trial ends',
                align: 'right',
                render: (row) => <span className="text-amber-300">{formatDate(row.trial_ends_at)}</span>,
              },
            ]}
          />
        </Panel>

        <Panel
          title="Past due accounts"
          description="Payments that failed or lapsed"
          action={
            <Link to="/admin/subscriptions?status=past_due">
              <Button variant="secondary" size="sm">View all</Button>
            </Link>
          }
        >
          <DataTable
            rows={attention.past_due}
            rowKey={(row) => row.id}
            emptyMessage="Nothing past due. Nice."
            columns={[
              {
                key: 'org',
                header: 'Organization',
                render: (row) => (
                  <Link to={`/admin/organizations/${row.organization_id}`} className="text-white font-medium hover:text-primary-300">
                    {row.organization_name}
                  </Link>
                ),
              },
              { key: 'plan', header: 'Plan', render: (row) => row.plan_name ?? '—' },
              {
                key: 'amount',
                header: 'Amount',
                align: 'right',
                render: (row) => <span className="text-rose-300">{formatCurrency(row.amount)}</span>,
              },
              { key: 'end', header: 'Period end', align: 'right', render: (row) => formatDate(row.current_period_end) },
            ]}
          />
        </Panel>

        <Panel title="Dormant organizations" description="No tracked time in the last 14 days">
          <DataTable
            rows={attention.dormant_organizations}
            rowKey={(row) => row.id}
            emptyMessage="Every organization is active."
            columns={[
              {
                key: 'name',
                header: 'Organization',
                render: (row) => (
                  <Link to={`/admin/organizations/${row.id}`} className="text-white font-medium hover:text-primary-300">
                    {row.name}
                  </Link>
                ),
              },
              { key: 'created', header: 'Joined', render: (row) => formatDate(row.created_at) },
              {
                key: 'last',
                header: 'Last activity',
                align: 'right',
                render: (row) =>
                  row.last_activity ? formatRelative(row.last_activity) : <Badge variant="danger">Never tracked</Badge>,
              },
            ]}
          />
        </Panel>

        <Panel title="Latest signups" description="Newest accounts on the platform">
          <DataTable
            rows={overview?.recent.signups ?? []}
            rowKey={(row) => row.id}
            emptyMessage="No signups yet."
            columns={[
              {
                key: 'user',
                header: 'User',
                render: (row) => (
                  <Link to={`/admin/users/${row.id}`} className="min-w-0 block hover:text-primary-300">
                    <span className="text-white font-medium block truncate">
                      {[row.first_name, row.last_name].filter(Boolean).join(' ') || row.email}
                    </span>
                    <span className="text-xs text-slate-500 block truncate">{row.email}</span>
                  </Link>
                ),
              },
              { key: 'org', header: 'Organization', render: (row) => row.organization_name ?? '—' },
              {
                key: 'verified',
                header: 'Status',
                render: (row) =>
                  row.email_verified_at ? <Badge variant="success">Verified</Badge> : <Badge variant="warning">Unverified</Badge>,
              },
              { key: 'joined', header: 'Joined', align: 'right', render: (row) => formatRelative(row.created_at) },
            ]}
          />
        </Panel>
      </div>

      <Panel
        title="Recent subscription movements"
        description="Signups, upgrades, downgrades, and cancellations"
        action={
          <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
            <Clock size={13} />
            {formatNumber(attention.failed_webhooks_24h)} webhook failures in 24h
          </span>
        }
      >
        <DataTable
          rows={overview?.recent.subscription_events ?? []}
          rowKey={(row) => row.id}
          emptyMessage="No subscription activity recorded yet."
          columns={[
            {
              key: 'org',
              header: 'Organization',
              render: (row) =>
                row.organization_id ? (
                  <Link to={`/admin/organizations/${row.organization_id}`} className="text-white font-medium hover:text-primary-300">
                    {row.organization_name ?? `Org #${row.organization_id}`}
                  </Link>
                ) : (
                  '—'
                ),
            },
            { key: 'action', header: 'Event', render: (row) => <StatusBadge status={row.action} /> },
            {
              key: 'plan',
              header: 'Plan change',
              render: (row) => (row.from_plan ? `${row.from_plan} → ${row.to_plan ?? '—'}` : (row.to_plan ?? '—')),
            },
            {
              key: 'amount',
              header: 'Amount',
              align: 'right',
              render: (row) => (row.amount ? formatCurrency(row.amount) : '—'),
            },
            { key: 'when', header: 'When', align: 'right', render: (row) => formatRelative(row.created_at) },
          ]}
        />
      </Panel>

      <div className="flex flex-wrap gap-3">
        <Link to="/admin/organizations">
          <Button variant="secondary" size="sm">
            <Building2 size={14} className="mr-2" />
            Manage organizations
          </Button>
        </Link>
        <Link to="/admin/users">
          <Button variant="secondary" size="sm">
            <UserPlus size={14} className="mr-2" />
            Manage users
          </Button>
        </Link>
        <Link to="/admin/plans">
          <Button variant="secondary" size="sm">
            <CreditCard size={14} className="mr-2" />
            Plans & features
          </Button>
        </Link>
      </div>
    </div>
  );
};

export default AdminOverviewPage;
