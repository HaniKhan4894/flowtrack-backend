import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Clock, TrendingUp, Users, Activity, Loader2 } from 'lucide-react';
import { dashboardService, type DashboardStats } from '../../api/dashboardService';

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
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const resp = await dashboardService.getStats();
        setStats(resp.data);
      } catch (e) {
        console.error(e);
        // Fallback dummy data if real API is not ready or fails
        setStats({
          total_hours: 124.5,
          productivity_score: 88,
          team_count: 12,
          active_timers: 5,
          recent_activity: [
            { id: 1, user: 'Agent Smith', action: 'started timer', target: 'FlowTrack UI', time: '2m ago', duration: '02:14:32' },
            { id: 2, user: 'Muhammad Irfan', action: 'completed task', target: 'API Integration', time: '1h ago', duration: '05:22:10' },
            { id: 3, user: 'Muhammad Irfan', action: 'created project', target: 'Mobile App', time: '3h ago', duration: '-' },
          ],
          weekly_stats: [
            { day: 'Mon', hours: 6 },
            { day: 'Tue', hours: 8 },
            { day: 'Wed', hours: 7.5 },
            { day: 'Thu', hours: 9 },
            { day: 'Fri', hours: 6.5 },
            { day: 'Sat', hours: 4 },
            { day: 'Sun', hours: 2 },
          ]
        });
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, []);

  if (loading || !stats) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="w-10 h-10 text-primary-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard icon={Clock} label="Total Hours" value={`${stats.total_hours}h`} trend={12} delay={0.1} />
        <StatCard icon={TrendingUp} label="Productivity" value={`${stats.productivity_score}%`} trend={4.2} delay={0.2} />
        <StatCard icon={Users} label="Team Members" value={stats.team_count} trend={0} delay={0.3} />
        <StatCard icon={Activity} label="Active Timers" value={stats.active_timers} trend={2} delay={0.4} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Custom Bar Chart */}
        <div className="bg-white/5 border border-white/10 rounded-3xl p-8 flex flex-col">
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-xl font-bold">Weekly Activity</h3>
            <select className="bg-white/5 border border-white/10 rounded-lg px-3 py-1 text-xs text-slate-400 outline-none">
              <option>Last 7 Days</option>
              <option>Last 30 Days</option>
            </select>
          </div>
          <div className="flex-1 flex items-end justify-between gap-2 h-64">
             {stats.weekly_stats.map((day, i) => (
               <div key={i} className="flex-1 flex flex-col items-center gap-2 group">
                 <div className="w-full relative flex items-end justify-center min-h-[4px]">
                    <motion.div 
                      initial={{ height: 0 }}
                      animate={{ height: `${(day.hours / 10) * 100}%` }}
                      transition={{ delay: i * 0.1, duration: 1 }}
                      className="w-full bg-ai-gradient rounded-t-lg group-hover:brightness-125 transition-all relative overflow-hidden shadow-ai"
                    >
                      <div className="absolute top-0 left-0 w-full h-full bg-[linear-gradient(90deg,transparent_0%,rgba(255,255,255,0.1)_50%,transparent_100%)]"></div>
                    </motion.div>
                    <div className="absolute -top-8 bg-primary-500 text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                      {day.hours}h
                    </div>
                 </div>
                 <span className="text-xs text-slate-500 font-bold uppercase">{day.day}</span>
               </div>
             ))}
          </div>
        </div>

        {/* Recent Activity */}
        <div className="bg-white/5 border border-white/10 rounded-3xl p-8">
          <h3 className="text-xl font-bold mb-6">Recent Activity</h3>
          <div className="space-y-6">
            {stats.recent_activity.map((activity) => (
              <div key={activity.id} className="flex items-center gap-4 group">
                <div className="w-2 h-2 rounded-full bg-primary-500 group-hover:scale-150 transition-transform shadow-ai"></div>
                <div className="flex-1">
                  <p className="text-white font-medium">
                    <span className="text-primary-400 font-bold">{activity.user}</span> {activity.action} for <span className="text-slate-300">{activity.target}</span>
                  </p>
                  <p className="text-xs text-slate-500">{activity.time}</p>
                </div>
                <span className="text-xs font-mono text-slate-400">{activity.duration}</span>
              </div>
            ))}
          </div>
          <button className="w-full mt-8 py-3 text-sm text-primary-400 font-bold hover:text-primary-300 transition-colors border border-primary-500/20 rounded-xl hover:bg-primary-500/5">
            View All Activity
          </button>
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;
