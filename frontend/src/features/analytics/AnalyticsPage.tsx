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
  ArrowDownRight,
  Calendar
} from 'lucide-react';
import { reportService, type TimeSummary, type ProjectBreakdown, type TeamLeaderboard } from '../../api/reportService';

const AnalyticsPage = () => {
  const [summary, setSummary] = useState<TimeSummary | null>(null);
  const [projects, setProjects] = useState<ProjectBreakdown[]>([]);
  const [leaderboard, setLeaderboard] = useState<TeamLeaderboard[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Filters
  const [filterRange, setFilterRange] = useState<'today' | '7days' | '30days' | 'month'>('7days');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  useEffect(() => {
    fetchData();
  }, [filterRange, startDate, endDate]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const params: any = {};
      
      if (startDate) params.start_date = startDate;
      if (endDate) params.end_date = endDate;
      
      // If range is selected, calculate dates if not manually set
      if (!startDate && !endDate) {
          const now = new Date();
          const today = now.toISOString().split('T')[0];
          params.end_date = today;
          
          if (filterRange === 'today') {
              params.start_date = today;
          } else if (filterRange === '7days') {
              const d = new Date();
              d.setDate(d.getDate() - 7);
              params.start_date = d.toISOString().split('T')[0];
          } else if (filterRange === '30days') {
              const d = new Date();
              d.setDate(d.getDate() - 30);
              params.start_date = d.toISOString().split('T')[0];
          } else if (filterRange === 'month') {
              const d = new Date();
              d.setDate(1);
              params.start_date = d.toISOString().split('T')[0];
          }
      }

      const [sumResp, projResp, leadResp] = await Promise.all([
        reportService.getTimeSummary(params),
        reportService.getProjectBreakdown(params),
        reportService.getTeamLeaderboard(params)
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
        { id: 2, first_name: 'Sarah', last_name: 'Chen', email: 'sar Chen', entries_count: 10, rank: 2, total_hours: 32.2 },
        { id: 3, first_name: 'Jordan', last_name: 'Smith', email: 'jordan@flowtrack.ai', entries_count: 8, rank: 3, total_hours: 15.8 }
      ]);
    } finally {
      setLoading(false);
    }
  };

  const getRangeLabel = () => {
    if (filterRange === 'today') return 'Today';
    if (filterRange === '7days') return 'Last 7 Days';
    if (filterRange === '30days') return 'Last 30 Days';
    if (filterRange === 'month') return 'This Month';
    return 'Custom Range';
  };

  return (
    <div className="space-y-8 pb-12">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Internal Analytics</h1>
          <p className="text-slate-400">Advanced insights into team productivity and project health.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex bg-white/5 rounded-xl border border-white/10 p-1">
             {(['today', '7days', 'month'] as const).map(range => (
               <button 
                 key={range}
                 onClick={() => setFilterRange(range)}
                 className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                   filterRange === range ? 'bg-primary-500 text-white shadow-lg' : 'text-slate-400 hover:text-white'
                 }`}
               >
                 {range === 'month' ? 'This Month' : range === '7days' ? 'Last 7 Days' : 'Today'}
               </button>
             ))}
          </div>

          <button className="flex items-center gap-2 bg-primary-500 hover:bg-primary-600 text-white px-5 py-2.5 rounded-xl font-bold transition-all shadow-ai">
            <Download size={18} />
            Export PDF
          </button>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[
          { label: 'Total Tracked', value: `${summary?.total_hours || 0}h`, icon: Clock, change: '+12%', up: true },
          { label: 'Productivity', value: '88%', icon: TrendingUp, change: '+5%', up: true },
          { label: 'Billable Amount', value: `$${(summary?.billable_hours || 0) * 50}`, icon: ArrowUpRight, change: '-2%', up: false },
          { label: 'Active Members', value: leaderboard.length.toString(), icon: Users, change: '0%', up: true },
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
            <h3 className="text-slate-400 text-sm font-medium mb-1 uppercase tracking-wider">{stat.label}</h3>
            <p className="text-2xl font-bold text-white">{stat.value}</p>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Project Breakdown */}
        <div className="lg:col-span-2 glass-card p-8 border border-white/5">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-4">
              <div className="p-4 rounded-2xl bg-primary-500/10 text-primary-400 shadow-inner">
                <BarChart3 size={24} />
              </div>
              <div>
                 <h2 className="text-xl font-bold text-white">Project Distribution</h2>
                 <p className="text-xs text-slate-500 uppercase font-bold tracking-widest">{getRangeLabel()}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-3 py-1.5">
               <Calendar size={14} className="text-slate-500" />
               <input 
                 type="date" 
                 value={startDate}
                 onChange={(e) => setStartDate(e.target.value)}
                 className="bg-transparent border-0 text-[10px] text-slate-300 p-0 focus:ring-0 uppercase font-bold w-24"
               />
               <span className="text-slate-600">-</span>
               <input 
                 type="date" 
                 value={endDate}
                 onChange={(e) => setEndDate(e.target.value)}
                 className="bg-transparent border-0 text-[10px] text-slate-300 p-0 focus:ring-0 uppercase font-bold w-24"
               />
            </div>
          </div>

          <div className="space-y-8">
            {projects.length > 0 ? projects.map((proj, i) => {
               const maxHours = Math.max(...projects.map(p => p.total_hours), 1);
               const percentage = (proj.total_hours / maxHours) * 100;
               return (
                 <div key={proj.id} className="space-y-3">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-3">
                         <div className={`w-2 h-10 rounded-full bg-primary-500`} />
                         <div>
                            <span className="font-bold text-slate-100 block">{proj.name}</span>
                            <span className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">{proj.entries_count} entries</span>
                         </div>
                      </div>
                      <div className="text-right">
                         <span className="text-white font-mono font-bold block">{proj.total_hours}h</span>
                         <span className="text-[10px] text-emerald-400 font-bold tracking-tighter">Active</span>
                      </div>
                    </div>
                    <div className="h-3 bg-white/5 rounded-full overflow-hidden p-0.5">
                      <motion.div 
                         initial={{ width: 0 }}
                         animate={{ width: `${percentage}%` }}
                         transition={{ duration: 1, delay: i * 0.1, ease: "easeOut" }}
                         className="h-full bg-gradient-to-r from-primary-600 to-primary-400 shadow-[0_0_10px_rgba(124,58,237,0.3)] rounded-full"
                      />
                    </div>
                 </div>
               );
            }) : (
              <div className="py-12 text-center">
                 <p className="text-slate-500 font-medium">No data for this period.</p>
              </div>
            )}
          </div>
        </div>

        {/* Team Leaderboard */}
        <div className="glass-card p-8 border border-white/5 flex flex-col">
          <div className="flex items-center gap-4 mb-8">
            <div className="p-4 rounded-2xl bg-secondary-500/10 text-secondary-400 shadow-inner">
              <Users size={24} />
            </div>
            <div>
               <h2 className="text-xl font-bold text-white">Team Performance</h2>
               <p className="text-xs text-slate-500 uppercase font-bold tracking-widest">Top Contributors</p>
            </div>
          </div>

          <div className="flex-1 space-y-6">
            {leaderboard.map((member, i) => (
              <div key={member.id} className="flex items-center gap-4 group cursor-default">
                <div className="relative">
                  <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center text-primary-400 font-bold text-sm border border-white/5 group-hover:border-primary-500/50 transition-all">
                    {member.first_name[0]}{member.last_name[0]}
                  </div>
                  <div className="absolute -top-2 -right-2 w-6 h-6 rounded-lg bg-[#12141C] border border-white/10 flex items-center justify-center text-xs font-bold text-amber-500 shadow-xl">
                    #{i + 1}
                  </div>
                </div>
                <div className="flex-1">
                  <h4 className="text-sm font-bold text-white group-hover:text-primary-400 transition-colors">
                    {member.first_name} {member.last_name}
                  </h4>
                  <div className="flex items-center gap-2 mt-1">
                     <span className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">{member.entries_count} logs</span>
                     <span className="w-1 h-1 rounded-full bg-slate-700" />
                     <span className={`text-[10px] font-bold ${i === 0 ? 'text-amber-500' : 'text-slate-400'}`}>
                        {i === 0 ? '🏆 Top Producer' : 'Active'}
                     </span>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-primary-400 font-mono tracking-tighter">{member.total_hours}h</p>
                </div>
              </div>
            ))}
          </div>

          <button className="mt-12 w-full py-3 bg-white/5 hover:bg-white/10 border border-white/5 rounded-2xl text-xs font-bold text-slate-400 hover:text-white transition-all uppercase tracking-widest">
            Full Team Report
          </button>
        </div>
      </div>
    </div>
  );
};

export default AnalyticsPage;
