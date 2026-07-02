import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Brain,
  Gauge,
  Loader2,
  Sparkles,
  Target,
  TrendingUp,
  AlertTriangle,
  Users,
  ShieldAlert,
} from 'lucide-react';
import { insightsService, type Benchmarks, type CoachSuggestion, type DeliveryRisk, type WeeklySummary, type WorkPatterns } from '../../api/insightsService';
import { hasPermission, canViewUnusualActivity } from '../../utils/access';
import { useAuthStore } from '../../store/authStore';
import { getApiErrorMessage } from '../../utils/apiError';
import { UnusualActivityPanel } from './UnusualActivityPanel';
import AskFlowTrack from './AskFlowTrack';

type Tab = 'weekly' | 'benchmarks' | 'patterns' | 'coach' | 'risks' | 'unusual';

const InsightsPage = () => {
  const { user } = useAuthStore();
  const canViewTeam = hasPermission(user, 'reports.view_team');
  const canViewUnusual = canViewUnusualActivity(user);
  const [tab, setTab] = useState<Tab>(canViewTeam ? 'weekly' : 'patterns');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [weekly, setWeekly] = useState<WeeklySummary | null>(null);
  const [benchmarks, setBenchmarks] = useState<Benchmarks | null>(null);
  const [patterns, setPatterns] = useState<WorkPatterns | null>(null);
  const [coach, setCoach] = useState<{ productive_percent: number; suggestions: CoachSuggestion[] } | null>(null);
  const [risks, setRisks] = useState<{ project_risks: DeliveryRisk[]; capacity: { utilization_percent: number; forecast: string; weekly_hours_logged: number; expected_weekly_capacity: number } } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const tasks: { key: string; run: () => Promise<unknown> }[] = [];

      if (canViewTeam) {
        tasks.push({ key: 'weekly', run: () => insightsService.getWeeklySummary().then((r) => setWeekly(r.data)) });
        tasks.push({ key: 'benchmarks', run: () => insightsService.getBenchmarks().then((r) => setBenchmarks(r.data)) });
        tasks.push({ key: 'risks', run: () => insightsService.getDeliveryRisks().then((r) => setRisks(r.data)) });
      }

      tasks.push({ key: 'patterns', run: () => insightsService.getWorkPatterns().then((r) => setPatterns(r.data)) });
      tasks.push({ key: 'coach', run: () => insightsService.getCoach().then((r) => setCoach(r.data)) });

      const results = await Promise.allSettled(tasks.map((t) => t.run()));
      const failedPersonal = results
        .map((result, index) => ({ result, key: tasks[index]?.key }))
        .filter(({ result, key }) => result.status === 'rejected' && (key === 'patterns' || key === 'coach'));

      if (failedPersonal.length > 0) {
        const reason = failedPersonal[0].result;
        setError(getApiErrorMessage(
          reason.status === 'rejected' ? reason.reason : null,
          'Failed to load insights',
        ));
      }
    } catch (e) {
      setError(getApiErrorMessage(e, 'Failed to load insights'));
    } finally {
      setLoading(false);
    }
  }, [canViewTeam]);

  useEffect(() => {
    load();
  }, [load]);

  const tabs: { id: Tab; label: string; icon: typeof Sparkles; managerOnly?: boolean; ownerManagerOnly?: boolean }[] = [
    { id: 'weekly', label: 'Weekly Digest', icon: TrendingUp, managerOnly: true },
    { id: 'benchmarks', label: 'Benchmarks', icon: Gauge, managerOnly: true },
    { id: 'patterns', label: 'Work Patterns', icon: Brain },
    { id: 'coach', label: 'Productivity Coach', icon: Target },
    { id: 'risks', label: 'Delivery Risks', icon: AlertTriangle, managerOnly: true },
    { id: 'unusual', label: 'Unusual Activity', icon: ShieldAlert, ownerManagerOnly: true },
  ];

  const visibleTabs = tabs.filter((t) => {
    if (t.ownerManagerOnly) return canViewUnusual;
    if (t.managerOnly) return canViewTeam;
    return true;
  });

  return (
    <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Sparkles className="w-7 h-7 text-violet-400" />
            Insights & AI Coach
          </h1>
          <p className="text-slate-400 mt-1">Weekly summaries, benchmarks, work patterns, and delivery forecasting.</p>
        </div>

        {canViewTeam && <AskFlowTrack />}

        <div className="flex flex-wrap gap-2">
          {visibleTabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition ${tab === t.id ? 'bg-violet-600 text-white' : 'bg-white/5 text-slate-300 hover:bg-white/10'}`}
            >
              <t.icon className="w-4 h-4" />
              {t.label}
            </button>
          ))}
        </div>

        {loading && (
          <div className="flex justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-violet-400" />
          </div>
        )}

        {error && !loading && <p className="text-red-400">{error}</p>}

        {!loading && tab === 'weekly' && weekly && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="grid gap-4 md:grid-cols-3">
            <div className="rounded-xl border border-white/10 bg-white/5 p-5">
              <p className="text-slate-400 text-sm">Team hours (7d)</p>
              <p className="text-3xl font-bold text-white">{weekly.total_hours}h</p>
              <p className={`text-sm mt-1 ${weekly.hours_delta >= 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
                {weekly.hours_delta >= 0 ? '+' : ''}{weekly.hours_delta}h vs prior week
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-5">
              <p className="text-slate-400 text-sm">Avg productivity</p>
              <p className="text-3xl font-bold text-white">{weekly.productive_percent}%</p>
              <p className="text-sm mt-1 text-slate-400">{weekly.productive_delta >= 0 ? '+' : ''}{weekly.productive_delta}% vs prior week</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-5">
              <p className="text-slate-400 text-sm flex items-center gap-1"><Users className="w-4 h-4" /> Top performers</p>
              <ul className="mt-2 space-y-1 text-sm">
                {weekly.top_members.map((m) => (
                  <li key={m.name} className="flex justify-between"><span>{m.name}</span><span>{m.hours}h</span></li>
                ))}
              </ul>
            </div>
            {weekly.highlights.length > 0 && (
              <div className="md:col-span-3 rounded-xl border border-white/10 bg-white/5 p-5">
                <p className="font-medium mb-2">Highlights</p>
                <ul className="list-disc list-inside text-slate-300 text-sm space-y-1">
                  {weekly.highlights.map((h) => <li key={h}>{h}</li>)}
                </ul>
              </div>
            )}
          </motion.div>
        )}

        {!loading && tab === 'benchmarks' && benchmarks && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-white/10 bg-white/5 p-5">
                <h3 className="font-semibold mb-3">By project</h3>
                <ul className="space-y-2 text-sm max-h-64 overflow-y-auto">
                  {benchmarks.by_project.map((p) => (
                    <li key={p.project_id} className="flex justify-between gap-2 border-b border-white/5 pb-2">
                      <span>{p.project_name}</span>
                      <span className="text-slate-400">{p.hours ?? p.total_hours}h{p.budget_utilization != null ? ` · ${p.budget_utilization}% budget` : ''}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-5">
                <h3 className="font-semibold mb-3">By role</h3>
                <ul className="space-y-2 text-sm">
                  {benchmarks.by_role.map((r) => (
                    <li key={r.slug} className="flex justify-between border-b border-white/5 pb-2">
                      <span>{r.role}</span><span>{r.hours}h</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            {benchmarks.by_sprint.length > 0 && (
              <div className="rounded-xl border border-white/10 bg-white/5 p-5">
                <h3 className="font-semibold mb-3">By sprint cycle</h3>
                <ul className="space-y-2 text-sm">
                  {benchmarks.by_sprint.map((s) => (
                    <li key={s.sprint_id} className="flex justify-between border-b border-white/5 pb-2">
                      <span>{s.name} ({s.start_date} – {s.end_date})</span>
                      <span>{s.hours}h</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </motion.div>
        )}

        {!loading && tab === 'patterns' && patterns && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-white/10 bg-white/5 p-5">
              <p className="text-slate-400 text-sm">Peak focus hour</p>
              <p className="text-3xl font-bold">{patterns.peak_hour}:00</p>
              <ul className="mt-4 space-y-1 text-sm text-slate-300">
                {patterns.insights.map((i) => <li key={i}>{i}</li>)}
              </ul>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-5">
              <p className="font-semibold mb-3">IDE / Browser / Comms split</p>
              {Object.entries(patterns.category_split).map(([k, v]) => (
                <div key={k} className="mb-2">
                  <div className="flex justify-between text-sm capitalize"><span>{k}</span><span>{v}%</span></div>
                  <div className="h-2 bg-slate-800 rounded-full mt-1"><div className="h-2 bg-violet-500 rounded-full" style={{ width: `${v}%` }} /></div>
                </div>
              ))}
            </div>
            <div className="md:col-span-2 rounded-xl border border-white/10 bg-white/5 p-5">
              <p className="font-semibold mb-3">Top apps</p>
              <div className="flex flex-wrap gap-2">
                {patterns.top_apps.map((a) => (
                  <span key={a.name} className="px-3 py-1 rounded-full bg-white/10 text-sm">{a.name} · {a.hours}h</span>
                ))}
              </div>
            </div>
          </motion.div>
        )}

        {!loading && tab === 'coach' && coach && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
            <p className="text-slate-400">Productivity score: <strong className="text-white">{coach.productive_percent}%</strong></p>
            {coach.suggestions.map((s, idx) => (
              <div key={`${s.title}-${idx}`} className={`rounded-xl border p-4 ${s.priority === 'high' ? 'border-amber-500/40 bg-amber-500/10' : 'border-white/10 bg-white/5'}`}>
                <p className="font-semibold">{s.title}</p>
                <p className="text-sm text-slate-300 mt-1">{s.message}</p>
              </div>
            ))}
          </motion.div>
        )}

        {!loading && tab === 'risks' && risks && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
            <div className="rounded-xl border border-white/10 bg-white/5 p-5">
              <p className="text-slate-400 text-sm">Team capacity</p>
              <p className="text-xl font-bold">{risks.capacity.utilization_percent}% utilized</p>
              <p className="text-sm text-slate-300 mt-1">{risks.capacity.forecast}</p>
              <p className="text-xs text-slate-500 mt-2">{risks.capacity.weekly_hours_logged}h logged / {risks.capacity.expected_weekly_capacity}h expected</p>
            </div>
            {risks.project_risks.length === 0 ? (
              <p className="text-slate-400">No delivery risks detected.</p>
            ) : (
              risks.project_risks.map((r) => (
                <div key={r.project_id} className={`rounded-xl border p-4 ${r.severity === 'high' ? 'border-red-500/40 bg-red-500/10' : 'border-amber-500/40 bg-amber-500/10'}`}>
                  <p className="font-semibold">{r.project_name}</p>
                  <p className="text-sm text-slate-300">{r.reason}</p>
                  <p className="text-xs text-slate-500 mt-2">{r.logged_hours}h logged</p>
                </div>
              ))
            )}
          </motion.div>
        )}

        {tab === 'unusual' && canViewUnusual && <UnusualActivityPanel />}
      </div>
  );
};

export default InsightsPage;
