import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { HeartPulse, Loader2, AlertTriangle, ShieldCheck, Activity, Users, User as UserIcon } from 'lucide-react';
import {
  wellbeingService,
  type WellbeingReport,
  type WellbeingTeamReport,
  type RiskLevel,
} from '../../api/wellbeingService';
import { useAuthStore } from '../../store/authStore';
import { canViewTeam } from '../../utils/access';
import { getApiErrorMessage } from '../../utils/apiError';

type Tab = 'me' | 'team';

const levelStyle: Record<RiskLevel, { text: string; bg: string; ring: string; label: string }> = {
  low: { text: 'text-emerald-300', bg: 'bg-emerald-500/15', ring: 'stroke-emerald-400', label: 'Low risk' },
  moderate: { text: 'text-amber-300', bg: 'bg-amber-500/15', ring: 'stroke-amber-400', label: 'Moderate risk' },
  high: { text: 'text-rose-300', bg: 'bg-rose-500/15', ring: 'stroke-rose-400', label: 'High risk' },
};

const ScoreRing = ({ score, level }: { score: number; level: RiskLevel }) => {
  const r = 52;
  const circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;
  return (
    <div className="relative w-32 h-32">
      <svg className="w-32 h-32 -rotate-90" viewBox="0 0 120 120">
        <circle cx="60" cy="60" r={r} className="stroke-white/10" strokeWidth="10" fill="none" />
        <circle
          cx="60" cy="60" r={r}
          className={levelStyle[level].ring}
          strokeWidth="10" fill="none" strokeLinecap="round"
          strokeDasharray={circ} strokeDashoffset={offset}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold text-white">{score}</span>
        <span className="text-[10px] text-slate-500 uppercase font-bold">risk</span>
      </div>
    </div>
  );
};

const Metric = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-xl border border-white/10 bg-white/5 p-4">
    <p className="text-[10px] text-slate-500 uppercase font-bold mb-1">{label}</p>
    <p className="text-lg font-bold text-white">{value}</p>
  </div>
);

const WellbeingPage = () => {
  const { user } = useAuthStore();
  const isManager = canViewTeam(user);

  const [tab, setTab] = useState<Tab>('me');
  const [days, setDays] = useState(14);
  const [me, setMe] = useState<WellbeingReport | null>(null);
  const [team, setTeam] = useState<WellbeingTeamReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    const req = tab === 'me' ? wellbeingService.me(days) : wellbeingService.team(days);
    req
      .then((r) => {
        if (!active) return;
        if (tab === 'me') setMe(r.data as WellbeingReport);
        else setTeam(r.data as WellbeingTeamReport);
      })
      .catch((e) => active && setError(getApiErrorMessage(e, 'Failed to load wellbeing data')))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [tab, days]);

  const pct = (n: number | null) => (n === null ? '—' : `${Math.round(n * 100)}%`);

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2 flex items-center gap-3">
            <HeartPulse className="text-rose-400" /> Wellbeing
          </h1>
          <p className="text-slate-400">Spot burnout risk early from real work patterns — and act on it.</p>
        </div>
        <select
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          className="bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-sm text-slate-300 outline-none focus:border-primary-500/50 self-start"
        >
          <option value={7}>Last 7 days</option>
          <option value={14}>Last 14 days</option>
          <option value={30}>Last 30 days</option>
        </select>
      </div>

      {isManager && (
        <div className="flex gap-2">
          {([['me', 'My Wellbeing', UserIcon], ['team', 'Team', Users]] as const).map(([id, label, Icon]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${
                tab === id ? 'bg-primary-500/10 text-primary-300 shadow-ai' : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Icon size={16} /> {label}
            </button>
          ))}
        </div>
      )}

      {error && <p className="text-rose-400 text-sm">{error}</p>}

      {loading ? (
        <div className="p-20 flex justify-center"><Loader2 className="w-8 h-8 text-primary-500 animate-spin" /></div>
      ) : tab === 'me' && me ? (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="glass rounded-3xl border border-white/5 shadow-ai p-6 flex flex-col items-center justify-center text-center">
            <ScoreRing score={me.score} level={me.level} />
            <span className={`mt-4 px-3 py-1 rounded-full text-xs font-bold ${levelStyle[me.level].bg} ${levelStyle[me.level].text}`}>
              {levelStyle[me.level].label}
            </span>
            <p className="text-xs text-slate-500 mt-3">{me.period.start} → {me.period.end}</p>
          </div>

          <div className="lg:col-span-2 grid grid-cols-2 md:grid-cols-3 gap-3">
            <Metric label="Total hours" value={`${me.metrics.total_hours}h`} />
            <Metric label="Avg / day" value={`${me.metrics.avg_daily_hours}h`} />
            <Metric label="Busiest day" value={`${me.metrics.max_day_hours}h`} />
            <Metric label="Longest session" value={`${me.metrics.longest_session_hours}h`} />
            <Metric label="After hours" value={pct(me.metrics.after_hours_ratio)} />
            <Metric label="Weekend" value={pct(me.metrics.weekend_ratio)} />
            <Metric label="Break time" value={pct(me.metrics.break_ratio)} />
            <Metric label="Longest streak" value={`${me.metrics.longest_streak_days}d`} />
            <Metric label="Active days" value={`${me.metrics.active_days}`} />
          </div>

          <div className="glass rounded-3xl border border-white/5 p-6">
            <div className="flex items-center gap-2 text-slate-400 text-xs uppercase font-bold mb-4">
              <Activity size={14} /> Contributing factors
            </div>
            {me.factors.length === 0 ? (
              <div className="flex items-center gap-2 text-emerald-300 text-sm">
                <ShieldCheck size={16} /> Balanced patterns — nothing concerning.
              </div>
            ) : (
              <div className="space-y-3">
                {me.factors.map((f, i) => (
                  <div key={i}>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-white font-semibold">{f.label}</span>
                      <span className="text-slate-500 text-xs">{f.detail}</span>
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-white/5 overflow-hidden">
                      <div className="h-full rounded-full bg-gradient-to-r from-amber-400 to-rose-500" style={{ width: `${Math.min(100, f.impact * 4)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="lg:col-span-2 glass rounded-3xl border border-white/5 p-6">
            <div className="flex items-center gap-2 text-slate-400 text-xs uppercase font-bold mb-4">
              <HeartPulse size={14} /> Recommendations
            </div>
            <ul className="space-y-2">
              {me.recommendations.map((rec, i) => (
                <li key={i} className="flex gap-2 text-sm text-slate-300">
                  <span className="text-primary-400 mt-0.5">→</span> {rec}
                </li>
              ))}
            </ul>
          </div>
        </motion.div>
      ) : tab === 'team' && team ? (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Metric label="Members" value={`${team.summary.members}`} />
            <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-4">
              <p className="text-[10px] text-rose-300/70 uppercase font-bold mb-1">High risk</p>
              <p className="text-lg font-bold text-rose-300">{team.summary.high_risk}</p>
            </div>
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-4">
              <p className="text-[10px] text-amber-300/70 uppercase font-bold mb-1">Moderate</p>
              <p className="text-lg font-bold text-amber-300">{team.summary.moderate}</p>
            </div>
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4">
              <p className="text-[10px] text-emerald-300/70 uppercase font-bold mb-1">Low risk</p>
              <p className="text-lg font-bold text-emerald-300">{team.summary.low_risk}</p>
            </div>
          </div>

          <div className="glass rounded-3xl border border-white/5 shadow-ai divide-y divide-white/5">
            {team.members.length === 0 ? (
              <p className="p-8 text-slate-500 text-sm text-center">No members with tracked time in this period.</p>
            ) : (
              team.members.map((m) => (
                <div key={m.user.id} className="p-4 flex items-center gap-4">
                  <div className={`w-11 h-11 rounded-xl flex items-center justify-center font-bold text-sm ${levelStyle[m.level].bg} ${levelStyle[m.level].text}`}>
                    {m.score}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-semibold truncate">{m.user.name}</p>
                    <p className="text-xs text-slate-500 truncate">
                      {m.tracked_hours}h tracked · {m.avg_daily}h/day
                      {m.top_factor ? ` · ${m.top_factor}` : ''}
                    </p>
                  </div>
                  {m.level === 'high' && <AlertTriangle size={18} className="text-rose-400 shrink-0" />}
                  <span className={`text-xs font-bold px-2 py-1 rounded-lg ${levelStyle[m.level].bg} ${levelStyle[m.level].text}`}>
                    {levelStyle[m.level].label}
                  </span>
                </div>
              ))
            )}
          </div>
        </motion.div>
      ) : null}
    </div>
  );
};

export default WellbeingPage;
