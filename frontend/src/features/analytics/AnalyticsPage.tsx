import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  BarChart3, 
  TrendingUp, 
  Users, 
  Clock, 
  Download, 
  Filter, 
  ChevronDown,
  ArrowUpRight,
  ArrowDownRight
} from 'lucide-react';
import { reportService, type TimeSummary, type ProjectBreakdown, type TeamLeaderboard } from '../../api/reportService';

const AnalyticsPage = () => {
  const [summary, setSummary] = useState<TimeSummary | null>(null);
  const [projects, setProjects] = useState<ProjectBreakdown[]>([]);
  const [leaderboard, setLeaderboard] = useState<TeamLeaderboard[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [sumResp, projResp, leadResp] = await Promise.all([
        reportService.getTimeSummary(),
        reportService.getProjectBreakdown(),
        reportService.getTeamLeaderboard()
      ]);
      setSummary(sumResp.data);
      setProjects(projResp.data);
      setLeaderboard(leadResp.data);
    } catch (e) {
      console.error('Failed to fetch analytics', e);
      // Fallback data
      setSummary({ total_entries: 142, total_hours: 86.5, avg_hours: 6.2, billable_hours: 70, non_billable_hours: 16.5 });
      setProjects([
        { id: 1, name: 'FlowTrack SaaS', client_name: 'Internal', entries_count: 45, total_seconds: 144000, total_hours: 40 },
        { id: 2, name: 'Marketing Web', client_name: 'Acme Corp', entries_count: 22, total_seconds: 72000, total_hours: 20 },
        { id: 3, name: 'Mobile App', client_name: 'Beta Systems', entries_count: 38, total_seconds: 93600, total_hours: 26 }
      ]);
      setLeaderboard([
        { id: 1, first_name: 'Alex', last_name: 'Rivera', email: 'alex@flowtrack.ai', entries_count: 12, rank: 1, total_hours: 38.5 },
        { id: 2, first_name: 'Sarah', last_name: 'Chen', email: 'sarah@flowtrack.ai', entries_count: 10, rank: 2, total_hours: 32.2 },
        { id: 3, first_name: 'Jordan', last_name: 'Smith', email: 'jordan@flowtrack.ai', entries_count: 8, rank: 3, total_hours: 15.8 }
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8 pb-12">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Internal Analytics</h1>
          <p className="text-slate-400">Advanced insights into team productivity and project health.</p>
        </div>
        <div className="flex items-center gap-3">
          <button className="flex items-center gap-2 bg-white/5 hover:bg-white/10 text-white px-4 py-2.5 rounded-xl border border-white/10 transition-all font-medium">
            <Filter size={18} />
            Filters
            <ChevronDown size={14} />
          </button>
          <button className="flex items-center gap-2 bg-primary-500 hover:bg-primary-600 text-white px-5 py-2.5 rounded-xl font-bold transition-all shadow-ai">
            <Download size={18} />
            Export PDF
          </button>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[
          { label: 'Total Tracked', value: `${summary?.total_hours || 0}h`, icon: Clock, change: '+12%', up: true },
          { label: 'Productivity', value: '88%', icon: TrendingUp, change: '+5%', up: true },
          { label: 'Billable Amount', value: '$8,420', icon: ArrowUpRight, change: '-2%', up: false },
          { label: 'Active Members', value: '14', icon: Users, change: '0%', up: true },
        ].map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="glass-card p-6 border border-white/5"
          >
            <div className="flex justify-between items-start mb-4">
              <div className="p-3 rounded-xl bg-white/5 text-primary-400">
                <stat.icon size={20} />
              </div>
              <div className={`flex items-center gap-1 text-xs font-bold ${stat.up ? 'text-emerald-400' : 'text-rose-400'}`}>
                {stat.change}
                {stat.up ? <TrendingUp size={12} /> : <ArrowDownRight size={12} />}
              </div>
            </div>
            <h3 className="text-slate-400 text-sm font-medium mb-1">{stat.label}</h3>
            <p className="text-2xl font-bold text-white">{stat.value}</p>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Project Breakdown */}
        <div className="lg:col-span-2 glass-card p-8 border border-white/5">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-primary-500/10 text-primary-400">
                <BarChart3 size={20} />
              </div>
              <h2 className="text-xl font-bold text-white">Project Distribution</h2>
            </div>
            <select className="bg-white/5 border border-white/10 rounded-lg text-xs text-slate-300 px-3 py-1.5 outline-none">
              <option>By Hours Worked</option>
              <option>By Billable Amount</option>
            </select>
          </div>

          <div className="space-y-6">
            {projects.map((proj, i) => (
               <div key={proj.id} className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-bold text-slate-200">{proj.name}</span>
                    <span className="text-slate-400 font-mono">{proj.total_hours}h</span>
                  </div>
                  <div className="h-2.5 bg-white/5 rounded-full overflow-hidden">
                    <motion.div 
                       initial={{ width: 0 }}
                       animate={{ width: `${(proj.total_hours / 40) * 100}%` }}
                       transition={{ duration: 1, delay: i * 0.2 }}
                       className="h-full bg-ai-gradient shadow-ai rounded-full"
                    />
                  </div>
               </div>
            ))}
          </div>
        </div>

        {/* Team Leaderboard */}
        <div className="glass-card p-8 border border-white/5 flex flex-col">
          <div className="flex items-center gap-4 mb-8">
            <div className="p-3 rounded-xl bg-secondary-500/10 text-secondary-400">
              <Users size={20} />
            </div>
            <h2 className="text-xl font-bold text-white">Top Productivity</h2>
          </div>

          <div className="flex-1 space-y-6">
            {leaderboard.map((member, i) => (
              <div key={member.id} className="flex items-center gap-4 group">
                <div className="relative">
                  <div className="w-10 h-10 rounded-full bg-surface-200 flex items-center justify-center text-primary-400 font-bold text-sm border border-white/10 group-hover:scale-110 transition-transform">
                    {member.first_name[0]}{member.last_name[0]}
                  </div>
                  <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-[#12141C] border border-white/10 flex items-center justify-center text-[10px] font-bold text-amber-400">
                    {i + 1}
                  </div>
                </div>
                <div className="flex-1">
                  <h4 className="text-sm font-bold text-white group-hover:text-primary-400 transition-colors">
                    {member.first_name} {member.last_name}
                  </h4>
                  <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">{member.entries_count} tasks completed</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-primary-400 font-mono">{member.total_hours}h</p>
                </div>
              </div>
            ))}
          </div>

          <button className="mt-8 text-center text-sm font-bold text-slate-500 hover:text-white transition-colors">
            View Full Team Report
          </button>
        </div>
      </div>
    </div>
  );
};

export default AnalyticsPage;
