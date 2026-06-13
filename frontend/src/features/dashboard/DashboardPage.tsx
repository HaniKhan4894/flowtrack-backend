import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Clock, TrendingUp, Users, Activity, Loader2, Timer } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { dashboardService, type DashboardStats } from '../../api/dashboardService';
import { useAuthStore } from '../../store/authStore';
import { isOrgAdmin } from '../../utils/access';

const StatCard = ({ icon: Icon, label, value, trend, delay }: any) => (
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
      <span className={`text-xs font-semibold px-2 py-1 rounded-full ${trend >= 0 ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
        {trend >= 0 ? '+' : ''}{trend}%
      </span>
    </div>
    <div className="space-y-1">
      <p className="text-sm text-slate-400 font-medium">{label}</p>
      <h3 className="text-3xl font-bold text-white">{value}</h3>
    </div>
  </motion.div>
);

const DashboardPage = () => {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const adminView = isOrgAdmin(user);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const resp = await dashboardService.getStats();
        setStats(resp.data);
      } catch (e) {
        console.error(e);
        setStats({
          total_hours: 0,
          productivity_score: 0,
          team_count: 0,
          active_timers: 0,
          recent_activity: [],
          weekly_stats: [],
        });
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, []);

  const maxWeeklyHours = useMemo(() => {
    if (!stats?.weekly_stats?.length) return 1;
    return Math.max(...stats.weekly_stats.map((d) => d.hours), 0.1);
  }, [stats]);

  if (loading || !stats) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="w-10 h-10 text-primary-500 animate-spin" />
      </div>
    );
  }

  const hasWeeklyData = stats.weekly_stats.some((d) => d.hours > 0);

  const statCards = adminView
    ? [
        { icon: Clock, label: 'Total Hours', value: `${stats.total_hours}h`, trend: 12, delay: 0.1 },
        { icon: TrendingUp, label: 'Productivity', value: `${stats.productivity_score}%`, trend: 4.2, delay: 0.2 },
        { icon: Users, label: 'Team Members', value: stats.team_count, trend: 0, delay: 0.3 },
        { icon: Activity, label: 'Active Timers', value: stats.active_timers, trend: 2, delay: 0.4 },
      ]
    : [
        { icon: Clock, label: 'My Hours', value: `${stats.total_hours}h`, trend: 0, delay: 0.1 },
        { icon: TrendingUp, label: 'Productivity', value: `${stats.productivity_score}%`, trend: 0, delay: 0.2 },
        { icon: Timer, label: 'My Active Timer', value: stats.active_timers > 0 ? 'Running' : 'None', trend: 0, delay: 0.3 },
      ];

  return (
    <div className="space-y-8">
      {user?.plan?.slug === 'free' && user?.features?.screenshots === false && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4 flex items-center justify-between gap-4">
          <p className="text-sm text-amber-200">
            Screenshots are not available on the Free plan — time tracking only.
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

      <div className={`grid grid-cols-1 md:grid-cols-2 ${adminView ? 'lg:grid-cols-4' : 'lg:grid-cols-3'} gap-6`}>
        {statCards.map((card) => (
          <StatCard key={card.label} {...card} />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Weekly Activity Chart */}
        <div className="bg-white/5 border border-white/10 rounded-3xl p-8 flex flex-col">
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-xl font-bold">{adminView ? 'Weekly Activity' : 'My Weekly Activity'}</h3>
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

        {/* Recent Activity */}
        <div className="bg-white/5 border border-white/10 rounded-3xl p-8">
          <h3 className="text-xl font-bold mb-6">{adminView ? 'Recent Activity' : 'My Recent Activity'}</h3>
          <div className="space-y-6">
            {stats.recent_activity.map((activity) => (
              <div key={activity.id} className="flex items-center gap-4 group">
                <div className="w-2 h-2 rounded-full bg-primary-500 group-hover:scale-150 transition-transform shadow-ai" />
                <div className="flex-1">
                  <p className="text-white font-medium">
                    {adminView ? (
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
          <button
            type="button"
            onClick={() => navigate('/activity')}
            className="w-full mt-8 py-3 text-sm text-primary-400 font-bold hover:text-primary-300 transition-colors border border-primary-500/20 rounded-xl hover:bg-primary-500/5"
          >
            View All Activity
          </button>
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;
