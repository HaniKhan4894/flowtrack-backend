import { Suspense, lazy, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import {
  Brain,
  Gauge,
  Sparkles,
  Target,
  TrendingUp,
  AlertTriangle,
  Users,
  ShieldAlert,
  LineChart,
} from 'lucide-react';
import { insightsService } from '../../api/insightsService';
import { hasPermission, canViewUnusualActivity } from '../../utils/access';
import { useAuthStore } from '../../store/authStore';
import { UnusualActivityPanel } from './UnusualActivityPanel';
import AskFlowTrack from './AskFlowTrack';
import { PageSkeleton, SkeletonCard, Tabs } from '../../components/ui';
import { getApiErrorMessage } from '../../utils/apiError';

const ForecastPanel = lazy(() => import('./ForecastPanel'));

type Tab = 'weekly' | 'benchmarks' | 'patterns' | 'coach' | 'risks' | 'forecast' | 'unusual';

const InsightsPage = () => {
  const user = useAuthStore((s) => s.user);
  const canViewTeam = hasPermission(user, 'reports.view_team');
  const canViewUnusual = canViewUnusualActivity(user);
  const [tab, setTab] = useState<Tab>(canViewTeam ? 'weekly' : 'patterns');

  useEffect(() => {
    if (!canViewTeam && (tab === 'weekly' || tab === 'benchmarks' || tab === 'risks' || tab === 'forecast')) {
      setTab('patterns');
    }
    if (!canViewUnusual && tab === 'unusual') {
      setTab('patterns');
    }
  }, [canViewTeam, canViewUnusual, tab]);

  const weeklyQ = useQuery({
    queryKey: ['insights', 'weekly'],
    queryFn: () => insightsService.getWeeklySummary().then((r) => r.data),
    enabled: tab === 'weekly' && canViewTeam,
  });
  const benchmarksQ = useQuery({
    queryKey: ['insights', 'benchmarks'],
    queryFn: () => insightsService.getBenchmarks().then((r) => r.data),
    enabled: tab === 'benchmarks' && canViewTeam,
  });
  const patternsQ = useQuery({
    queryKey: ['insights', 'patterns'],
    queryFn: () => insightsService.getWorkPatterns().then((r) => r.data),
    enabled: tab === 'patterns',
  });
  const coachQ = useQuery({
    queryKey: ['insights', 'coach'],
    queryFn: () => insightsService.getCoach().then((r) => r.data),
    enabled: tab === 'coach',
  });
  const risksQ = useQuery({
    queryKey: ['insights', 'risks'],
    queryFn: () => insightsService.getDeliveryRisks().then((r) => r.data),
    enabled: tab === 'risks' && canViewTeam,
  });

  const activeQuery = {
    weekly: weeklyQ,
    benchmarks: benchmarksQ,
    patterns: patternsQ,
    coach: coachQ,
    risks: risksQ,
    forecast: { isLoading: false, isError: false, error: null },
    unusual: { isLoading: false, isError: false, error: null },
  }[tab];

  const loading = !!activeQuery?.isLoading;
  const error =
    activeQuery && 'isError' in activeQuery && activeQuery.isError
      ? getApiErrorMessage((activeQuery as { error: unknown }).error, 'Failed to load insights')
      : null;

  const weekly = weeklyQ.data ?? null;
  const benchmarks = benchmarksQ.data ?? null;
  const patterns = patternsQ.data ?? null;
  const coach = coachQ.data ?? null;
  const risks = risksQ.data ?? null;

  const tabs = [
    { id: 'weekly', label: 'Weekly Digest', icon: <TrendingUp className="w-4 h-4" />, managerOnly: true },
    { id: 'benchmarks', label: 'Benchmarks', icon: <Gauge className="w-4 h-4" />, managerOnly: true },
    { id: 'patterns', label: 'Work Patterns', icon: <Brain className="w-4 h-4" /> },
    { id: 'coach', label: 'Productivity Coach', icon: <Target className="w-4 h-4" /> },
    { id: 'risks', label: 'Delivery Risks', icon: <AlertTriangle className="w-4 h-4" />, managerOnly: true },
    { id: 'forecast', label: 'Forecast', icon: <LineChart className="w-4 h-4" />, managerOnly: true },
    { id: 'unusual', label: 'Unusual Activity', icon: <ShieldAlert className="w-4 h-4" />, ownerManagerOnly: true },
  ].filter((t) => {
    if ('ownerManagerOnly' in t && t.ownerManagerOnly) return canViewUnusual;
    if ('managerOnly' in t && t.managerOnly) return canViewTeam;
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

      <Tabs tabs={tabs} activeId={tab} onChange={(id) => setTab(id as Tab)} />

      {loading && (
        <div className="grid gap-4 md:grid-cols-3">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
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
          </div>
          {risks.project_risks.map((r) => (
            <div key={r.project_id} className={`rounded-xl border p-4 ${r.severity === 'high' ? 'border-red-500/40 bg-red-500/10' : 'border-amber-500/40 bg-amber-500/10'}`}>
              <p className="font-semibold">{r.project_name}</p>
              <p className="text-sm text-slate-300">{r.reason}</p>
            </div>
          ))}
        </motion.div>
      )}

      {tab === 'forecast' && canViewTeam && (
        <Suspense fallback={<PageSkeleton />}>
          <ForecastPanel />
        </Suspense>
      )}

      {tab === 'unusual' && canViewUnusual && <UnusualActivityPanel />}
    </div>
  );
};

export default InsightsPage;
