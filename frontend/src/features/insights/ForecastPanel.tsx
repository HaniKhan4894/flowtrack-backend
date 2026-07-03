import { useEffect, useMemo, useState } from 'react';
import {
  Area,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Loader2, TrendingUp, CalendarClock, Sparkles, AlertTriangle } from 'lucide-react';
import { insightsService, type Forecast, type ForecastProject, type RiskLevel } from '../../api/insightsService';
import { getApiErrorMessage } from '../../utils/apiError';

const RISK_STYLE: Record<RiskLevel, string> = {
  high: 'border-red-500/40 bg-red-500/10 text-red-300',
  medium: 'border-amber-500/40 bg-amber-500/10 text-amber-300',
  low: 'border-sky-500/40 bg-sky-500/10 text-sky-300',
  none: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
};

const RISK_LABEL: Record<RiskLevel, string> = {
  high: 'High risk',
  medium: 'At risk',
  low: 'Watch',
  none: 'On track',
};

const fmtDate = (d: string) => {
  const parsed = new Date(d + 'T00:00:00');
  return Number.isNaN(parsed.getTime()) ? d : parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

const ForecastChart = ({ project }: { project: ForecastProject }) => {
  const data = project.series.map((p) => ({
    date: fmtDate(p.date),
    actual: p.actual,
    projected: p.projected,
  }));

  return (
    <ResponsiveContainer width="100%" height={220}>
      <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: -12 }}>
        <defs>
          <linearGradient id={`actual-${project.project_id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.4} />
            <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 11 }} interval="preserveStartEnd" minTickGap={28} />
        <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} width={44} unit="h" />
        <Tooltip
          contentStyle={{ background: '#12141C', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, color: '#fff' }}
          formatter={(value, name) => [value != null ? `${value}h` : '—', name === 'actual' ? 'Logged' : 'Projected']}
        />
        {project.budget_hours > 0 && (
          <ReferenceLine
            y={project.budget_hours}
            stroke="#f43f5e"
            strokeDasharray="4 4"
            label={{ value: `Budget ${project.budget_hours}h`, fill: '#fda4af', fontSize: 11, position: 'insideTopRight' }}
          />
        )}
        <Area type="monotone" dataKey="actual" stroke="#8b5cf6" strokeWidth={2} fill={`url(#actual-${project.project_id})`} connectNulls={false} />
        <Line type="monotone" dataKey="projected" stroke="#38bdf8" strokeWidth={2} strokeDasharray="5 4" dot={false} connectNulls />
      </ComposedChart>
    </ResponsiveContainer>
  );
};

const ForecastPanel = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forecast, setForecast] = useState<Forecast | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    insightsService
      .getForecast()
      .then((r) => { if (alive) setForecast(r.data); })
      .catch((e) => { if (alive) setError(getApiErrorMessage(e, 'Failed to load forecast')); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const atRisk = useMemo(
    () => (forecast?.projects ?? []).filter((p) => p.risk !== 'none'),
    [forecast],
  );

  if (loading) {
    return <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-violet-400" /></div>;
  }

  if (error) {
    return <p className="text-red-400">{error}</p>;
  }

  if (!forecast) {
    return null;
  }

  return (
    <div className="space-y-6">
      {forecast.ai.enabled && forecast.ai.narrative && (
        <div className="rounded-xl border border-violet-500/30 bg-violet-500/10 p-5">
          <p className="flex items-center gap-2 font-semibold text-violet-200 mb-2">
            <Sparkles className="w-4 h-4" /> AI forecast briefing
          </p>
          <p className="text-sm text-slate-200 whitespace-pre-line leading-relaxed">{forecast.ai.narrative}</p>
          {forecast.ai.model && <p className="text-[11px] text-slate-500 mt-2">Model: {forecast.ai.model}</p>}
        </div>
      )}

      {!forecast.ai.enabled && (
        <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-slate-400">
          Connect an AI key in Settings → Integrations to get an AI-written forecast briefing. Numeric projections below work without it.
        </div>
      )}

      {/* Sprint deadline risk */}
      {forecast.sprints.length > 0 && (
        <div className="rounded-xl border border-white/10 bg-white/5 p-5">
          <h3 className="flex items-center gap-2 font-semibold mb-3"><CalendarClock className="w-4 h-4 text-sky-400" /> Sprint deadline risk</h3>
          <div className="space-y-2">
            {forecast.sprints.map((s) => (
              <div key={s.sprint_id} className="flex flex-wrap items-center justify-between gap-3 border-b border-white/5 pb-2 last:border-0">
                <div>
                  <p className="text-sm text-white font-medium">{s.name}</p>
                  <p className="text-xs text-slate-500">
                    Due {fmtDate(s.end_date)} · {s.days_left}d left · {s.remaining_hours}h remaining
                    {s.required_daily > 0 && ` · need ${s.required_daily}h/day (now ${s.recent_daily}h/day)`}
                  </p>
                </div>
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-lg border ${RISK_STYLE[s.risk]}`}>
                  {RISK_LABEL[s.risk]}
                  {s.miss_probability != null && s.risk !== 'none' ? ` · ${Math.round(s.miss_probability * 100)}%` : ''}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Project budget projections */}
      <div>
        <h3 className="flex items-center gap-2 font-semibold mb-1"><TrendingUp className="w-4 h-4 text-violet-400" /> Budget burn-up projection</h3>
        <p className="text-xs text-slate-500 mb-4">
          Solid line = logged hours, dashed = projected at recent pace over the next {forecast.horizon_days} days.
        </p>

        {atRisk.length === 0 && (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-300 mb-4">
            No projects are forecast to overrun budget in the next {forecast.horizon_days} days.
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-2">
          {forecast.projects.filter((p) => p.budget_hours > 0).map((p) => (
            <div key={p.project_id} className="rounded-xl border border-white/10 bg-white/5 p-4">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div>
                  <p className="font-medium text-white">{p.project_name}</p>
                  <p className="text-xs text-slate-500">
                    {p.logged_hours}h / {p.budget_hours}h
                    {p.utilization_percent != null ? ` · ${p.utilization_percent}% used` : ''}
                    {` · ${p.daily_burn_rate}h/day`}
                  </p>
                </div>
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-lg border whitespace-nowrap ${RISK_STYLE[p.risk]}`}>
                  {RISK_LABEL[p.risk]}
                </span>
              </div>
              {p.projected_overrun_date && (
                <p className="flex items-center gap-1.5 text-xs text-amber-300 mb-2">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  {p.days_to_overrun === 0
                    ? 'Already over budget'
                    : `Projected to exceed budget on ${fmtDate(p.projected_overrun_date)} (~${p.days_to_overrun}d)`}
                </p>
              )}
              <ForecastChart project={p} />
            </div>
          ))}
        </div>

        {forecast.projects.filter((p) => p.budget_hours > 0).length === 0 && (
          <p className="text-slate-400 text-sm">Set budget hours on your projects to see burn-up projections.</p>
        )}
      </div>
    </div>
  );
};

export default ForecastPanel;
