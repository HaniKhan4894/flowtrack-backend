import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Activity,
  ArrowRight,
  DollarSign,
  Filter,
  Flame,
  HeartPulse,
  Rocket,
  Send,
  Sparkles,
  TrendingDown,
  Users,
} from 'lucide-react';
import { growthService } from '../../api/growthService';
import { getApiErrorMessage } from '../../utils/apiError';
import { toastError } from '../../store/toastStore';
import type {
  ChurnReport,
  CohortReport,
  GrowthOverview,
  HealthReport,
  SegmentDefinition,
  SegmentOrganization,
} from '../../types/growth';
import { Badge, Button, Card, Modal, Tabs, cn } from '../../components/ui';
import { DataTable, Panel, ProgressBar, SelectFilter, StatCard } from './components/AdminUI';
import { formatCurrency, formatDate, formatMonthShort, formatNumber, formatRelative } from './components/format';

const CHART_TOOLTIP = {
  background: '#12141C',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 12,
  color: '#fff',
  fontSize: 12,
} as const;

const MONTH_OPTIONS = [
  { value: '6', label: '6 months' },
  { value: '9', label: '9 months' },
  { value: '12', label: '12 months' },
  { value: '18', label: '18 months' },
];

const FUNNEL_DAYS_OPTIONS = [
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
  { value: '180', label: 'Last 180 days' },
  { value: '365', label: 'Last 12 months' },
];

const GOAL_TONE: Record<string, string> = {
  acquisition: 'bg-sky-500/10 text-sky-300 border-sky-500/25',
  onboarding: 'bg-indigo-500/10 text-indigo-300 border-indigo-500/25',
  engagement: 'bg-violet-500/10 text-violet-300 border-violet-500/25',
  retention: 'bg-amber-500/10 text-amber-300 border-amber-500/25',
  winback: 'bg-rose-500/10 text-rose-300 border-rose-500/25',
  expansion: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/25',
  dunning: 'bg-orange-500/10 text-orange-300 border-orange-500/25',
  announcement: 'bg-slate-500/10 text-slate-300 border-slate-500/25',
};

const retentionTone = (percent: number): string => {
  if (percent >= 70) return 'bg-emerald-500/70 text-white';
  if (percent >= 45) return 'bg-emerald-500/45 text-white';
  if (percent >= 25) return 'bg-amber-500/45 text-white';
  if (percent > 0) return 'bg-rose-500/40 text-white';
  return 'bg-white/5 text-slate-500';
};

const AdminGrowthPage = () => {
  const [tab, setTab] = useState('overview');

  const [overview, setOverview] = useState<GrowthOverview | null>(null);
  const [funnelDays, setFunnelDays] = useState('90');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [cohorts, setCohorts] = useState<CohortReport | null>(null);
  const [cohortMonths, setCohortMonths] = useState('9');
  const [cohortLoading, setCohortLoading] = useState(false);

  const [churn, setChurn] = useState<ChurnReport | null>(null);
  const [churnMonths, setChurnMonths] = useState('12');
  const [churnLoading, setChurnLoading] = useState(false);

  const [health, setHealth] = useState<HealthReport | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [healthBand, setHealthBand] = useState('');

  const [segment, setSegment] = useState<SegmentDefinition | null>(null);
  const [segmentRows, setSegmentRows] = useState<SegmentOrganization[]>([]);
  const [segmentLoading, setSegmentLoading] = useState(false);

  const loadOverview = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await growthService.getGrowthOverview(Number(funnelDays));
      setOverview(response.data);
    } catch (e) {
      setError(getApiErrorMessage(e, 'Could not load growth analytics'));
    } finally {
      setLoading(false);
    }
  }, [funnelDays]);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  const loadCohorts = useCallback(async () => {
    setCohortLoading(true);
    try {
      const response = await growthService.getCohorts(Number(cohortMonths));
      setCohorts(response.data);
    } catch (e) {
      toastError(getApiErrorMessage(e, 'Could not load cohorts'));
    } finally {
      setCohortLoading(false);
    }
  }, [cohortMonths]);

  useEffect(() => {
    if (tab === 'retention') void loadCohorts();
  }, [tab, loadCohorts]);

  const loadChurn = useCallback(async () => {
    setChurnLoading(true);
    try {
      const response = await growthService.getChurnReport(Number(churnMonths));
      setChurn(response.data);
    } catch (e) {
      toastError(getApiErrorMessage(e, 'Could not load churn analysis'));
    } finally {
      setChurnLoading(false);
    }
  }, [churnMonths]);

  useEffect(() => {
    if (tab === 'churn') void loadChurn();
  }, [tab, loadChurn]);

  const loadHealth = useCallback(async () => {
    setHealthLoading(true);
    try {
      const response = await growthService.getHealthScores(80);
      setHealth(response.data);
    } catch (e) {
      toastError(getApiErrorMessage(e, 'Could not load account health'));
    } finally {
      setHealthLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === 'health') void loadHealth();
  }, [tab, loadHealth]);

  const openSegment = async (definition: SegmentDefinition) => {
    setSegment(definition);
    setSegmentLoading(true);
    setSegmentRows([]);
    try {
      const config = Object.fromEntries(definition.config.map((field) => [field.key, field.default]));
      const response = await growthService.getSegmentMembers(definition.key, { ...config, limit: 100 });
      setSegmentRows(response.data.organizations);
    } catch (e) {
      toastError(getApiErrorMessage(e, 'Could not load segment members'));
    } finally {
      setSegmentLoading(false);
    }
  };

  const metrics = overview?.metrics;
  const churnTrend = (churn?.churn.trend ?? []).map((row) => ({ ...row, label: formatMonthShort(row.month) }));
  const movement = (churn?.revenue_movement ?? []).map((row) => ({ ...row, label: formatMonthShort(row.month) }));
  const filteredHealth = (health?.accounts ?? []).filter((a) => healthBand === '' || a.health_band === healthBand);
  const maxOffset = Math.max(1, ...(cohorts?.cohorts ?? []).map((c) => c.periods.length));

  if (error) {
    return (
      <Card className="text-center py-12">
        <p className="text-sm text-rose-300">{error}</p>
        <Button size="sm" variant="secondary" className="mt-4" onClick={() => void loadOverview()}>
          Try again
        </Button>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Tabs
        tabs={[
          { id: 'overview', label: 'Funnel & segments' },
          { id: 'retention', label: 'Cohort retention' },
          { id: 'churn', label: 'Churn & net revenue' },
          { id: 'health', label: 'Account health', count: health?.bands.at_risk },
        ]}
        activeId={tab}
        onChange={setTab}
      />

      {tab === 'overview' && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <StatCard
              icon={DollarSign}
              label="MRR"
              value={formatCurrency(metrics?.mrr ?? 0)}
              hint={`ARR ${formatCurrency(metrics?.arr ?? 0)}`}
              tone="positive"
            />
            <StatCard
              icon={Activity}
              label="Collected (30d)"
              value={formatCurrency(metrics?.collected_30d ?? 0)}
              changePercent={metrics?.collected_growth_percent ?? undefined}
              hint={`Lifetime ${formatCurrency(metrics?.lifetime_revenue ?? 0)}`}
            />
            <StatCard
              icon={Rocket}
              label="Trial → paid"
              value={`${metrics?.trial_conversion_percent ?? 0}%`}
              hint={`${formatNumber(metrics?.trials ?? 0)} trials running`}
              tone={(metrics?.trial_conversion_percent ?? 0) >= 25 ? 'positive' : 'warning'}
            />
            <StatCard
              icon={Send}
              label="Campaign revenue"
              value={formatCurrency(metrics?.campaigns.attributed_revenue ?? 0)}
              hint={`${formatNumber(metrics?.campaigns.conversions ?? 0)} conversions from ${formatNumber(metrics?.campaigns.emails_sent ?? 0)} sends`}
            />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <Panel
              className="xl:col-span-2"
              title="Acquisition funnel"
              description="Where new signups stall on the way to paying."
              action={<SelectFilter value={funnelDays} onChange={setFunnelDays} options={FUNNEL_DAYS_OPTIONS} label="Range" />}
            >
              {loading ? (
                <div className="space-y-3">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="h-10 animate-pulse rounded-xl bg-white/5" />
                  ))}
                </div>
              ) : (
                <div className="space-y-3">
                  {(overview?.funnel.stages ?? []).map((stage, index) => (
                    <div key={stage.key} className="space-y-1.5">
                      <div className="flex items-baseline justify-between gap-3">
                        <p className="text-sm text-slate-300">
                          <span className="text-slate-500 mr-2 tabular-nums">{index + 1}.</span>
                          {stage.label}
                        </p>
                        <div className="flex items-baseline gap-3 shrink-0">
                          <span className="text-sm font-semibold text-white tabular-nums">
                            {formatNumber(stage.count)}
                          </span>
                          <span className="text-xs text-slate-500 tabular-nums w-12 text-right">
                            {stage.percent_of_signups}%
                          </span>
                        </div>
                      </div>
                      <ProgressBar
                        percent={stage.percent_of_signups}
                        tone={stage.percent_of_signups >= 60 ? 'emerald' : stage.percent_of_signups >= 30 ? 'primary' : 'amber'}
                      />
                      {index > 0 && stage.drop_off > 0 && (
                        <p className="text-[11px] text-rose-300/80">
                          {formatNumber(stage.drop_off)} dropped off here ({100 - stage.step_conversion}% of previous step)
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Panel>

            <Panel title="Engagement distribution" description="Accounts by hours tracked in the last 30 days.">
              {loading ? (
                <div className="h-64 animate-pulse rounded-xl bg-white/5" />
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={overview?.engagement ?? []} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis type="number" stroke="#64748b" fontSize={11} />
                    <YAxis type="category" dataKey="bucket" stroke="#64748b" fontSize={10} width={95} />
                    <Tooltip contentStyle={CHART_TOOLTIP} />
                    <Bar dataKey="count" name="Accounts" radius={[0, 6, 6, 0]}>
                      {(overview?.engagement ?? []).map((entry, index) => (
                        <Cell
                          key={entry.bucket}
                          fill={['#f43f5e', '#f59e0b', '#6366f1', '#22c55e', '#10b981'][index] ?? '#6366f1'}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Panel>
          </div>

          <Panel
            title="Lifecycle segments"
            description="Live audiences you can target with a campaign. Click any card to see the accounts inside."
            action={
              <Link to="/admin/campaigns">
                <Button size="sm" variant="secondary">
                  <Sparkles size={14} />
                  Create campaign
                </Button>
              </Link>
            }
          >
            {loading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                {Array.from({ length: 9 }).map((_, i) => (
                  <div key={i} className="h-28 animate-pulse rounded-2xl bg-white/5" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                {(overview?.segments ?? []).map((definition) => (
                  <button
                    key={definition.key}
                    type="button"
                    onClick={() => void openSegment(definition)}
                    className="text-left rounded-2xl border border-white/10 bg-white/[0.02] p-4 hover:border-primary-500/30 hover:bg-white/[0.05] transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <p className="text-sm font-semibold text-white">{definition.label}</p>
                      <span
                        className={cn(
                          'text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border shrink-0',
                          GOAL_TONE[definition.goal] ?? GOAL_TONE.announcement,
                        )}
                      >
                        {definition.goal}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mb-3 line-clamp-2">{definition.description}</p>
                    <div className="flex items-end justify-between gap-2">
                      <div>
                        <p className="text-2xl font-bold text-white leading-none tabular-nums">
                          {formatNumber(definition.organizations ?? 0)}
                        </p>
                        <p className="text-[11px] text-slate-500 mt-1">
                          {formatNumber(definition.recipients ?? 0)} contacts
                        </p>
                      </div>
                      {(definition.mrr ?? 0) > 0 && (
                        <p className="text-xs font-semibold text-emerald-300 tabular-nums">
                          {formatCurrency(definition.mrr ?? 0)} MRR
                        </p>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </Panel>

          <Panel title="Campaign performance by goal" description="Which lifecycle motion actually produces revenue.">
            <DataTable
              columns={[
                {
                  key: 'goal',
                  header: 'Goal',
                  render: (row: GrowthOverview['campaigns']['by_goal'][number]) => (
                    <span
                      className={cn(
                        'text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border',
                        GOAL_TONE[row.goal] ?? GOAL_TONE.announcement,
                      )}
                    >
                      {row.goal}
                    </span>
                  ),
                },
                {
                  key: 'campaigns',
                  header: 'Campaigns',
                  align: 'right' as const,
                  render: (row: GrowthOverview['campaigns']['by_goal'][number]) => formatNumber(row.campaigns),
                },
                {
                  key: 'sent',
                  header: 'Sent',
                  align: 'right' as const,
                  render: (row: GrowthOverview['campaigns']['by_goal'][number]) => formatNumber(row.sent),
                },
                {
                  key: 'open',
                  header: 'Open rate',
                  align: 'right' as const,
                  render: (row: GrowthOverview['campaigns']['by_goal'][number]) => `${row.open_rate}%`,
                },
                {
                  key: 'conv',
                  header: 'Conversion',
                  align: 'right' as const,
                  render: (row: GrowthOverview['campaigns']['by_goal'][number]) => (
                    <span className={row.conversion_rate > 0 ? 'text-emerald-300 font-medium' : ''}>
                      {row.conversion_rate}%
                    </span>
                  ),
                },
                {
                  key: 'revenue',
                  header: 'Revenue',
                  align: 'right' as const,
                  render: (row: GrowthOverview['campaigns']['by_goal'][number]) => (
                    <span className="font-semibold text-white tabular-nums">{formatCurrency(row.revenue)}</span>
                  ),
                },
              ]}
              rows={overview?.campaigns.by_goal ?? []}
              isLoading={loading}
              rowKey={(row) => row.goal}
              emptyMessage="No campaigns yet — install a playbook to get started."
            />
          </Panel>
        </>
      )}

      {tab === 'retention' && (
        <div className="space-y-6">
          <div className="flex justify-end">
            <SelectFilter value={cohortMonths} onChange={setCohortMonths} options={MONTH_OPTIONS} label="Cohorts" />
          </div>

          <Panel
            title="Signup cohort retention"
            description="Percentage of each month's signups still tracking time in later months."
          >
            {cohortLoading ? (
              <div className="h-72 animate-pulse rounded-xl bg-white/5" />
            ) : (cohorts?.cohorts ?? []).length === 0 ? (
              <p className="text-sm text-slate-500 py-10 text-center">Not enough history yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[720px]">
                  <thead>
                    <tr className="text-slate-500">
                      <th className="pb-3 px-2 text-left text-[11px] font-bold uppercase tracking-wide">Cohort</th>
                      <th className="pb-3 px-2 text-right text-[11px] font-bold uppercase tracking-wide">Signups</th>
                      {Array.from({ length: maxOffset }).map((_, offset) => (
                        <th key={offset} className="pb-3 px-1 text-center text-[11px] font-bold uppercase tracking-wide">
                          M{offset}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(cohorts?.cohorts ?? []).map((cohort) => (
                      <tr key={cohort.cohort} className="border-t border-white/5">
                        <td className="py-2 px-2">
                          <p className="text-slate-200 font-medium">{formatMonthShort(cohort.cohort)}</p>
                          <p className="text-[11px] text-slate-500">
                            {cohort.conversion_percent}% paid · {formatCurrency(cohort.revenue_per_signup)}/signup
                          </p>
                        </td>
                        <td className="py-2 px-2 text-right tabular-nums text-slate-300">{formatNumber(cohort.size)}</td>
                        {Array.from({ length: maxOffset }).map((_, offset) => {
                          const period = cohort.periods[offset];
                          return (
                            <td key={offset} className="py-2 px-1">
                              {period ? (
                                <div
                                  className={cn(
                                    'rounded-lg py-1.5 text-center text-[11px] font-semibold tabular-nums',
                                    retentionTone(period.percent),
                                  )}
                                  title={`${period.active} of ${cohort.size} active`}
                                >
                                  {period.percent}%
                                </div>
                              ) : (
                                <div className="rounded-lg py-1.5 text-center text-[11px] text-slate-700">·</div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          <Panel title="Cohort revenue" description="Total collected revenue generated by each signup cohort.">
            {cohortLoading ? (
              <div className="h-64 animate-pulse rounded-xl bg-white/5" />
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <ComposedChart
                  data={(cohorts?.cohorts ?? []).map((c) => ({
                    label: formatMonthShort(c.cohort),
                    revenue: c.revenue,
                    size: c.size,
                    conversion: c.conversion_percent,
                  }))}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="label" stroke="#64748b" fontSize={11} />
                  <YAxis yAxisId="left" stroke="#64748b" fontSize={11} />
                  <YAxis yAxisId="right" orientation="right" stroke="#64748b" fontSize={11} unit="%" />
                  <Tooltip contentStyle={CHART_TOOLTIP} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar yAxisId="left" dataKey="revenue" name="Revenue" fill="#6366f1" radius={[6, 6, 0, 0]} />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="conversion"
                    name="Paid conversion %"
                    stroke="#22c55e"
                    strokeWidth={2}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </Panel>
        </div>
      )}

      {tab === 'churn' && (
        <div className="space-y-6">
          <div className="flex justify-end">
            <SelectFilter value={churnMonths} onChange={setChurnMonths} options={MONTH_OPTIONS} label="Range" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatCard
              icon={TrendingDown}
              label="MRR lost (last month)"
              value={formatCurrency(churnTrend.at(-1)?.mrr_lost ?? 0)}
              hint={`${formatNumber(churnTrend.at(-1)?.churned ?? 0)} accounts cancelled`}
              tone="danger"
            />
            <StatCard
              icon={Activity}
              label="Net MRR (last month)"
              value={formatCurrency(churnTrend.at(-1)?.net_mrr ?? 0)}
              hint={`Added ${formatCurrency(churnTrend.at(-1)?.mrr_added ?? 0)}`}
              tone={(churnTrend.at(-1)?.net_mrr ?? 0) >= 0 ? 'positive' : 'danger'}
            />
            <StatCard
              icon={Flame}
              label="Recovered accounts"
              value={formatNumber(churn?.churn.recovered_accounts ?? 0)}
              hint="Cancelled once, paying again"
              tone="positive"
            />
          </div>

          <Panel title="Churn vs new business" description="Accounts started and cancelled each month.">
            {churnLoading ? (
              <div className="h-64 animate-pulse rounded-xl bg-white/5" />
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <ComposedChart data={churnTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="label" stroke="#64748b" fontSize={11} />
                  <YAxis stroke="#64748b" fontSize={11} />
                  <Tooltip contentStyle={CHART_TOOLTIP} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="started" name="Started" fill="#22c55e" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="churned" name="Churned" fill="#f43f5e" radius={[6, 6, 0, 0]} />
                  <Line type="monotone" dataKey="net_accounts" name="Net accounts" stroke="#6366f1" strokeWidth={2} />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </Panel>

          <Panel
            title="Net revenue retention"
            description="How last month's revenue base moved: expansion vs contraction vs churn."
          >
            {churnLoading ? (
              <div className="h-64 animate-pulse rounded-xl bg-white/5" />
            ) : movement.length === 0 ? (
              <p className="text-sm text-slate-500 py-10 text-center">
                Needs at least two months of payment history.
              </p>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={280}>
                  <ComposedChart data={movement}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis dataKey="label" stroke="#64748b" fontSize={11} />
                    <YAxis yAxisId="left" stroke="#64748b" fontSize={11} />
                    <YAxis yAxisId="right" orientation="right" stroke="#64748b" fontSize={11} unit="%" />
                    <Tooltip contentStyle={CHART_TOOLTIP} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar yAxisId="left" dataKey="new" name="New" stackId="m" fill="#6366f1" />
                    <Bar yAxisId="left" dataKey="expansion" name="Expansion" stackId="m" fill="#22c55e" />
                    <Bar yAxisId="left" dataKey="contraction" name="Contraction" stackId="m" fill="#f59e0b" />
                    <Bar yAxisId="left" dataKey="churned" name="Churned" stackId="m" fill="#f43f5e" />
                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey="net_retention_percent"
                      name="NRR %"
                      stroke="#e2e8f0"
                      strokeWidth={2}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
                <p className="text-xs text-slate-500 mt-3">
                  Latest NRR: <span className="text-white font-semibold">{movement.at(-1)?.net_retention_percent}%</span>{' '}
                  · Gross retention {movement.at(-1)?.gross_retention_percent}%
                </p>
              </>
            )}
          </Panel>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <Panel title="Churn by plan" description="Which plan leaks the most revenue.">
              <DataTable
                columns={[
                  {
                    key: 'plan',
                    header: 'Plan',
                    render: (row: ChurnReport['churn']['by_plan'][number]) => (
                      <span className="text-slate-200">{row.plan_name}</span>
                    ),
                  },
                  {
                    key: 'churned',
                    header: 'Churned',
                    align: 'right' as const,
                    render: (row: ChurnReport['churn']['by_plan'][number]) => formatNumber(row.churned),
                  },
                  {
                    key: 'mrr',
                    header: 'MRR lost',
                    align: 'right' as const,
                    render: (row: ChurnReport['churn']['by_plan'][number]) => (
                      <span className="text-rose-300 tabular-nums">{formatCurrency(row.mrr_lost)}</span>
                    ),
                  },
                  {
                    key: 'tenure',
                    header: 'Avg tenure',
                    align: 'right' as const,
                    render: (row: ChurnReport['churn']['by_plan'][number]) => `${row.avg_tenure_days}d`,
                  },
                ]}
                rows={churn?.churn.by_plan ?? []}
                isLoading={churnLoading}
                rowKey={(row) => row.plan_name}
                emptyMessage="No cancellations recorded."
              />
            </Panel>

            <Panel title="How long before they leave" description="Tenure at cancellation — early churn means onboarding gaps.">
              {churnLoading ? (
                <div className="h-56 animate-pulse rounded-xl bg-white/5" />
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={churn?.churn.tenure_buckets ?? []}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis dataKey="label" stroke="#64748b" fontSize={10} />
                    <YAxis stroke="#64748b" fontSize={11} />
                    <Tooltip contentStyle={CHART_TOOLTIP} />
                    <Bar dataKey="count" name="Accounts" fill="#f43f5e" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Panel>
          </div>
        </div>
      )}

      {tab === 'health' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <StatCard
              icon={HeartPulse}
              label="Healthy"
              value={formatNumber(health?.bands.healthy ?? 0)}
              hint="Score 75+"
              tone="positive"
            />
            <StatCard
              icon={Activity}
              label="Watch"
              value={formatNumber(health?.bands.watch ?? 0)}
              hint="Score 50–74"
              tone="warning"
            />
            <StatCard
              icon={TrendingDown}
              label="At risk"
              value={formatNumber(health?.bands.at_risk ?? 0)}
              hint="Score below 50"
              tone="danger"
            />
            <StatCard
              icon={DollarSign}
              label="MRR at risk"
              value={formatCurrency(health?.mrr_at_risk ?? 0)}
              hint="From at-risk accounts"
              tone="danger"
            />
          </div>

          <Panel
            title="Account health"
            description="Scored on activity recency, usage trend, seat adoption and payment failures — worst first."
            action={
              <SelectFilter
                value={healthBand}
                onChange={setHealthBand}
                options={[
                  { value: '', label: 'All bands' },
                  { value: 'at_risk', label: 'At risk' },
                  { value: 'watch', label: 'Watch' },
                  { value: 'healthy', label: 'Healthy' },
                ]}
                label="Band"
              />
            }
          >
            <DataTable
              columns={[
                {
                  key: 'org',
                  header: 'Organization',
                  render: (row: HealthReport['accounts'][number]) => (
                    <div className="min-w-0">
                      <Link
                        to={`/admin/organizations/${row.organization_id}`}
                        className="font-medium text-white hover:text-primary-300"
                      >
                        {row.organization_name}
                      </Link>
                      <p className="text-xs text-slate-500">
                        {row.plan_name ?? '—'} · {formatCurrency(row.mrr)}/mo
                      </p>
                    </div>
                  ),
                },
                {
                  key: 'score',
                  header: 'Health',
                  render: (row: HealthReport['accounts'][number]) => (
                    <div className="w-28">
                      <div className="flex items-baseline justify-between mb-1">
                        <span className="text-sm font-bold text-white tabular-nums">{row.health_score}</span>
                        <Badge
                          variant={
                            row.health_band === 'healthy' ? 'success' : row.health_band === 'watch' ? 'warning' : 'danger'
                          }
                        >
                          {row.health_band.replace('_', ' ')}
                        </Badge>
                      </div>
                      <ProgressBar
                        percent={row.health_score}
                        tone={row.health_band === 'healthy' ? 'emerald' : row.health_band === 'watch' ? 'amber' : 'amber'}
                      />
                    </div>
                  ),
                },
                {
                  key: 'usage',
                  header: 'Usage (30d)',
                  align: 'right' as const,
                  render: (row: HealthReport['accounts'][number]) => (
                    <div>
                      <p className="text-slate-200 tabular-nums">{row.hours_30d}h</p>
                      {row.usage_trend_percent !== null && (
                        <p
                          className={cn(
                            'text-[11px] tabular-nums',
                            row.usage_trend_percent < 0 ? 'text-rose-300' : 'text-emerald-300',
                          )}
                        >
                          {row.usage_trend_percent > 0 ? '+' : ''}
                          {row.usage_trend_percent}% vs prev
                        </p>
                      )}
                    </div>
                  ),
                },
                {
                  key: 'seats',
                  header: 'Seat adoption',
                  align: 'right' as const,
                  render: (row: HealthReport['accounts'][number]) => (
                    <span className="text-slate-300 tabular-nums">
                      {row.active_members}/{row.members} ({row.seat_adoption_percent}%)
                    </span>
                  ),
                },
                {
                  key: 'signals',
                  header: 'Signals',
                  render: (row: HealthReport['accounts'][number]) => (
                    <div className="space-y-1 max-w-[260px]">
                      {row.risk_reasons.slice(0, 2).map((reason) => (
                        <p key={reason} className="text-[11px] text-rose-300/90">
                          {reason}
                        </p>
                      ))}
                      {row.opportunities.slice(0, 1).map((op) => (
                        <p key={op} className="text-[11px] text-emerald-300/90">
                          {op}
                        </p>
                      ))}
                      {row.risk_reasons.length === 0 && row.opportunities.length === 0 && (
                        <p className="text-[11px] text-slate-500">No issues detected</p>
                      )}
                    </div>
                  ),
                },
                {
                  key: 'last',
                  header: 'Last active',
                  render: (row: HealthReport['accounts'][number]) => (
                    <span className="text-xs text-slate-400">{formatRelative(row.last_activity_at)}</span>
                  ),
                },
              ]}
              rows={filteredHealth}
              isLoading={healthLoading}
              rowKey={(row) => row.organization_id}
              emptyMessage="No accounts in this band."
            />
          </Panel>
        </div>
      )}

      <Modal open={segment !== null} onClose={() => setSegment(null)} title={segment?.label ?? ''} size="xl">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate-400 max-w-xl">{segment?.description}</p>
            <Link to={`/admin/campaigns?segment=${segment?.key ?? ''}`} onClick={() => setSegment(null)}>
              <Button size="sm">
                <Send size={14} />
                Campaign for this segment
                <ArrowRight size={14} />
              </Button>
            </Link>
          </div>

          <DataTable
            columns={[
              {
                key: 'org',
                header: 'Organization',
                render: (row: SegmentOrganization) => (
                  <div className="min-w-0">
                    <Link
                      to={`/admin/organizations/${row.organization_id}`}
                      className="font-medium text-white hover:text-primary-300"
                    >
                      {row.organization_name}
                    </Link>
                    <p className="text-xs text-slate-500 truncate">{row.owner_email ?? '—'}</p>
                  </div>
                ),
              },
              {
                key: 'context',
                header: 'Why',
                render: (row: SegmentOrganization) => (
                  <span className="text-xs text-amber-300/90">{row.context ?? '—'}</span>
                ),
              },
              {
                key: 'plan',
                header: 'Plan',
                render: (row: SegmentOrganization) => <span className="text-slate-300">{row.plan_name ?? '—'}</span>,
              },
              {
                key: 'mrr',
                header: 'MRR',
                align: 'right' as const,
                render: (row: SegmentOrganization) => (
                  <span className="tabular-nums text-white">{formatCurrency(row.mrr)}</span>
                ),
              },
              {
                key: 'ltv',
                header: 'LTV',
                align: 'right' as const,
                render: (row: SegmentOrganization) => (
                  <span className="tabular-nums text-emerald-300">{formatCurrency(row.lifetime_value)}</span>
                ),
              },
              {
                key: 'usage',
                header: 'Hours 30d',
                align: 'right' as const,
                render: (row: SegmentOrganization) => <span className="tabular-nums">{row.hours_30d}h</span>,
              },
              {
                key: 'members',
                header: 'Team',
                align: 'right' as const,
                render: (row: SegmentOrganization) => (
                  <span className="inline-flex items-center gap-1 text-slate-300">
                    <Users size={12} />
                    {row.members}
                  </span>
                ),
              },
              {
                key: 'joined',
                header: 'Joined',
                render: (row: SegmentOrganization) => (
                  <span className="text-xs text-slate-400">{formatDate(row.created_at)}</span>
                ),
              },
            ]}
            rows={segmentRows}
            isLoading={segmentLoading}
            rowKey={(row) => row.organization_id}
            emptyMessage="No accounts currently match this segment."
          />

          {segment && segment.config.length > 0 && (
            <p className="text-[11px] text-slate-500 flex items-center gap-1.5">
              <Filter size={12} />
              Using default thresholds ({segment.config.map((f) => `${f.label}: ${f.default}`).join(', ')}). Tune them
              per campaign in the campaign editor.
            </p>
          )}
        </div>
      </Modal>
    </div>
  );
};

export default AdminGrowthPage;
