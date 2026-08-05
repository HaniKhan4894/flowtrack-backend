import { useMemo, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { Clock, TrendingUp, Users, Activity, Timer, Radio } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { dashboardService } from '../../api/dashboardService';
import { type ActiveSession } from '../../api/reportService';
import { useActiveSessions } from '../../hooks/useActiveSessions';
import { useAuthStore } from '../../store/authStore';
import { useTimerStore } from '../../store/timerStore';
import { canViewMemberTracking, canViewOrgPackage, hasPlanFeature } from '../../utils/access';
import { formatDurationHms } from '../../utils/liveTimer';
import { OnboardingChecklist } from './OnboardingChecklist';
import { PageSkeleton, Badge } from '../../components/ui';
import { DashboardLayoutEditor } from './dashboardLayout';

function useLiveActiveSessions(sessions: ActiveSession[], fetchedAt: number) {
  const [now, setNow] = useState(() => Date.now());
  const anyRunning = sessions.some((s) => !s.is_paused);

  useEffect(() => {
    if (!anyRunning) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [anyRunning, sessions.length]);

  return useMemo(
    () =>
      sessions.map((s) => {
        const drift = s.is_paused || !fetchedAt
          ? 0
          : Math.max(0, Math.floor((now - fetchedAt) / 1000));
        const seconds = (s.elapsed_seconds ?? 0) + drift;
        return { ...s, live_elapsed: seconds, live_label: formatDurationHms(seconds) };
      }),
    [sessions, fetchedAt, now],
  );
}

const StatCard = ({ icon: Icon, label, value, trend, delay }: {
  icon: typeof Clock;
  label: string;
  value: string | number;
  trend: number;
  delay: number;
}) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay }}
    className="bg-white/5 border border-white/10 rounded-2xl p-6 hover:bg-white/8 transition-all group"
  >
    <div className="flex justify-between items-start mb-4">
      <div className="p-3 rounded-xl bg-primary-500/10 text-primary-400 group-hover:scale-110 transition-transform">
        <Icon size={24} />
      </div>
      <Badge variant={trend >= 0 ? 'success' : 'danger'}>
        {trend >= 0 ? '+' : ''}{trend}%
      </Badge>
    </div>
    <div className="space-y-1">
      <p className="text-sm text-slate-400 font-medium">{label}</p>
      <h3 className="text-3xl font-bold text-white">{value}</h3>
    </div>
  </motion.div>
);

function TargetIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-primary-400">
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
    </svg>
  );
}

const DashboardPage = () => {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const timerRunning = useTimerStore((state) => state.isRunning);
  const teamView = canViewMemberTracking(user);

  const statsQuery = useQuery({
    queryKey: ['dashboard', 'stats', user?.organization_id, user?.id],
    queryFn: async () => {
      try {
        const resp = await dashboardService.getStats();
        return resp.data;
      } catch {
        return {
          total_hours: 0,
          productivity_score: 0,
          team_count: 0,
          active_timers: 0,
          recent_activity: [] as { id: number; user: string; action: string; target: string; time: string; duration: string }[],
          weekly_stats: [] as { day: string; hours: number }[],
        };
      }
    },
    enabled: !!user?.id,
  });

  const sessionsQuery = useActiveSessions({ pollMs: 60_000 });

  const stats = statsQuery.data;
  const activeSessions = useLiveActiveSessions(
    sessionsQuery.data ?? [],
    sessionsQuery.dataUpdatedAt || Date.now(),
  );
  const loading = statsQuery.isLoading || !stats;

  const maxWeeklyHours = useMemo(() => {
    if (!stats?.weekly_stats?.length) return 1;
    return Math.max(...stats.weekly_stats.map((d) => d.hours), 0.1);
  }, [stats]);

  if (loading) {
    return <PageSkeleton />;
  }

  const hasWeeklyData = stats.weekly_stats.some((d) => d.hours > 0);
  const dailyTarget = stats.daily_target ?? 8;
  const hoursToday = stats.hours_today ?? 0;
  const pctOfTarget = stats.pct_of_target ?? Math.min(100, Math.round((hoursToday / dailyTarget) * 100));

  const statCards = teamView
    ? [
        { icon: Clock, label: 'Total Hours', value: `${stats.total_hours}h`, trend: 12, delay: 0.1 },
        { icon: TrendingUp, label: 'Productivity', value: `${stats.productivity_score}%`, trend: 4.2, delay: 0.2 },
        { icon: Users, label: 'Team Members', value: stats.team_count, trend: 0, delay: 0.3 },
        { icon: Activity, label: 'Active Timers', value: stats.active_timers, trend: 2, delay: 0.4 },
      ]
    : [
        { icon: Clock, label: 'My Hours', value: `${stats.total_hours}h`, trend: 0, delay: 0.1 },
        { icon: TrendingUp, label: 'Productivity', value: `${stats.productivity_score}%`, trend: 0, delay: 0.2 },
        { icon: Timer, label: 'My Active Timer', value: timerRunning ? 'Running' : 'None', trend: 0, delay: 0.3 },
      ];

  const showOnboarding = Boolean(user?.onboarding && !user.onboarding.is_complete);
  const hasActivityTracking = hasPlanFeature(user, 'activity_tracking');
  const isFreePlan = user?.plan?.slug === 'free';

  return (
    <div className="space-y-8">
      {canViewOrgPackage(user) && isFreePlan && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4 flex items-center justify-between gap-4">
          <p className="text-sm text-amber-200">
            Free plan includes time tracking &amp; projects. Upgrade for screenshots, activity monitoring, invoicing, and AI insights.
          </p>
          <button
            type="button"
            onClick={() => navigate('/billing')}
            className="text-xs font-bold text-amber-300 hover:underline whitespace-nowrap"
          >
            Upgrade plan
          </button>
        </div>
      )}

      <div className={`grid grid-cols-1 gap-6 ${showOnboarding ? 'lg:grid-cols-3' : ''}`}>
        <div className={`grid grid-cols-1 md:grid-cols-2 ${showOnboarding ? 'lg:col-span-2' : ''} ${teamView ? 'lg:grid-cols-2' : 'lg:grid-cols-3'} gap-6`}>
          {statCards.map((card) => (
            <StatCard key={card.label} {...card} />
          ))}
        </div>
        {showOnboarding && <OnboardingChecklist compact />}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white/5 border border-white/10 rounded-3xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <TargetIcon /> Daily Goal
            </h3>
            <span className="text-xs text-slate-500 font-bold uppercase">{hoursToday}h / {dailyTarget}h</span>
          </div>
          <div className="h-3 bg-white/5 rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(pctOfTarget, 100)}%` }}
              className="h-full bg-ai-gradient rounded-full"
            />
          </div>
          <p className="text-sm text-slate-400 mt-2">{pctOfTarget}% of today&apos;s target</p>
        </div>

        <div className="bg-white/5 border border-white/10 rounded-3xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Radio size={18} className="text-emerald-400" /> Working Now
            </h3>
            <span className="text-xs text-slate-500">Live · refreshes every 1 min</span>
          </div>
          <div className="space-y-3 max-h-40 overflow-y-auto">
            {activeSessions.length > 0 ? activeSessions.map((s) => (
              <div key={s.time_entry_id} className="flex items-center justify-between p-3 rounded-xl bg-white/5">
                <div className="flex items-center gap-3">
                  <span className={`w-2 h-2 rounded-full ${s.is_paused ? 'bg-amber-400' : 'bg-emerald-400 animate-pulse'}`} />
                  <div>
                    <p className="text-sm font-semibold text-white">{s.user_name}</p>
                    <p className="text-xs text-slate-500">{s.project_name}</p>
                  </div>
                </div>
                <span className="text-xs font-mono text-emerald-400">{s.live_label}</span>
              </div>
            )) : (
              <p className="text-sm text-slate-500">No one is tracking time right now.</p>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white/5 border border-white/10 rounded-3xl p-8 flex flex-col">
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-xl font-bold">{teamView ? 'Weekly Activity' : 'My Weekly Activity'}</h3>
            <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">Last 7 Days</span>
          </div>

          {!hasWeeklyData ? (
            <div className="flex-1 flex items-center justify-center h-64 text-slate-500 text-sm">
              No tracked time in the last 7 days. Start a timer to see activity here.
            </div>
          ) : (
            <div className="flex items-end justify-between gap-3 h-64">
              {stats.weekly_stats.map((day, i) => {
                const barHeight = Math.max((day.hours / maxWeeklyHours) * 100, day.hours > 0 ? 8 : 0);
                return (
                  <div key={`${day.day}-${i}`} className="flex-1 flex flex-col items-center gap-2 h-full">
                    <div className="flex-1 w-full flex flex-col justify-end relative group min-h-0">
                      <motion.div
                        initial={{ height: 0 }}
                        animate={{ height: `${barHeight}%` }}
                        transition={{ delay: i * 0.08, duration: 0.6 }}
                        className="w-full bg-ai-gradient rounded-t-lg group-hover:brightness-125 transition-all shadow-ai min-h-[4px]"
                      />
                      <div className="absolute -top-7 left-1/2 -translate-x-1/2 bg-primary-500 text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">
                        {day.hours}h
                      </div>
                    </div>
                    <span className="text-xs text-slate-500 font-bold uppercase shrink-0">{day.day}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="bg-white/5 border border-white/10 rounded-3xl p-8">
          <h3 className="text-xl font-bold mb-6">{teamView ? 'Recent Activity' : 'My Recent Activity'}</h3>
          <div className="space-y-6">
            {stats.recent_activity.map((activity) => (
              <div key={activity.id} className="flex items-center gap-4 group">
                <div className="w-2 h-2 rounded-full bg-primary-500 group-hover:scale-150 transition-transform shadow-ai" />
                <div className="flex-1">
                  <p className="text-white font-medium">
                    {teamView ? (
                      <>
                        <span className="text-primary-400 font-bold">{activity.user}</span> {activity.action} for{' '}
                        <span className="text-slate-300">{activity.target}</span>
                      </>
                    ) : (
                      <>
                        You {activity.action}{' '}
                        <span className="text-slate-300">{activity.target}</span>
                      </>
                    )}
                  </p>
                  <p className="text-xs text-slate-500">{activity.time}</p>
                </div>
                <span className="text-xs font-mono text-slate-400">{activity.duration}</span>
              </div>
            ))}
            {stats.recent_activity.length === 0 && (
              <p className="text-sm text-slate-500">No recent activity yet.</p>
            )}
          </div>
          {hasActivityTracking ? (
            <button
              type="button"
              onClick={() => navigate('/activity')}
              className="w-full mt-8 py-3 text-sm text-primary-400 font-bold hover:text-primary-300 transition-colors border border-primary-500/20 rounded-xl hover:bg-primary-500/5"
            >
              View All Activity
            </button>
          ) : (
            <button
              type="button"
              onClick={() => navigate(canViewOrgPackage(user) ? '/billing' : '/time')}
              className="w-full mt-8 py-3 text-sm text-primary-400 font-bold hover:text-primary-300 transition-colors border border-primary-500/20 rounded-xl hover:bg-primary-500/5"
            >
              {canViewOrgPackage(user) ? 'Unlock activity monitoring' : 'Go to Time Tracking'}
            </button>
          )}
        </div>
      </div>

      <DashboardLayoutEditor />
    </div>
  );
};

export default DashboardPage;
