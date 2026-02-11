import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Calendar, Filter, Download, MoreHorizontal, Clock, Tag, Briefcase, Loader2 } from 'lucide-react';
import { timeService } from '../../api/timeService';
import type { TimeEntry } from '../../types';

const TimeTrackingPage = () => {
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchEntries();
  }, []);

  const fetchEntries = async () => {
    try {
      const resp = await timeService.getAll();
      setEntries(resp.data);
    } catch (e) {
      console.error(e);
      // Fallback dummy data
      setEntries([
        { id: 1, description: 'Initial Dashboard Layout', project_id: 1, start_time: '2026-02-01 10:00:00', end_time: '2026-02-01 12:30:00', duration_seconds: 9000 },
        { id: 2, description: 'API Authentication Flow', project_id: 1, start_time: '2026-02-01 14:00:00', end_time: '2026-02-01 16:45:00', duration_seconds: 9900 },
        { id: 3, description: 'Researching CORS issues', project_id: 2, start_time: '2026-01-31 09:15:00', end_time: '2026-01-31 11:20:00', duration_seconds: 7500 },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const formatDuration = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${h}h ${m}m`;
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="w-10 h-10 text-primary-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Time Logs</h1>
          <p className="text-slate-400">Review and manage your tracked time entries.</p>
        </div>
        <div className="flex items-center gap-3">
          <button className="flex items-center gap-2 bg-white/5 hover:bg-white/10 text-white px-4 py-2.5 rounded-xl border border-white/10 transition-all">
            <Calendar size={18} />
            Last 7 Days
          </button>
          <button className="flex items-center gap-2 bg-primary-500 hover:bg-primary-600 text-white px-5 py-2.5 rounded-xl font-bold transition-all shadow-ai">
            <Download size={18} />
            Export
          </button>
        </div>
      </div>

      <div className="glass rounded-3xl overflow-hidden border border-white/5 shadow-ai">
        <div className="p-6 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
          <div className="flex items-center gap-4">
            <div className="h-10 w-10 rounded-xl bg-primary-500/10 flex items-center justify-center text-primary-400">
              <Filter size={20} />
            </div>
            <span className="font-bold text-white">Filters</span>
          </div>
          <div className="flex gap-2">
            <span className="px-3 py-1 bg-white/5 rounded-lg text-xs text-slate-400 border border-white/5">Project: All</span>
            <span className="px-3 py-1 bg-white/5 rounded-lg text-xs text-slate-400 border border-white/5">User: All</span>
          </div>
        </div>

        <div className="divide-y divide-white/5">
          {entries.length > 0 ? (
            entries.map((entry) => (
              <motion.div 
                key={entry.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="p-6 hover:bg-white/[0.02] transition-colors group flex flex-col md:flex-row md:items-center justify-between gap-6"
              >
                <div className="flex items-start gap-4 flex-1">
                  <div className="w-12 h-12 rounded-2xl bg-surface-200 flex items-center justify-center text-slate-500 group-hover:bg-primary-500/10 group-hover:text-primary-400 transition-colors">
                    <Clock size={24} />
                  </div>
                  <div className="space-y-1">
                    <h4 className="font-bold text-white group-hover:text-primary-400 transition-colors uppercase tracking-tight">
                      {entry.description || 'No Description'}
                    </h4>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                      <div className="flex items-center gap-1">
                        <Briefcase size={14} className="text-secondary-400" />
                        Project Alpha
                      </div>
                      <div className="flex items-center gap-1">
                        <Tag size={14} />
                        Product Design
                      </div>
                      <div className="flex items-center gap-1">
                        <Calendar size={14} />
                        {entry.start_time ? formatDate(entry.start_time) : 'No Date'}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-8 pl-16 md:pl-0">
                  <div className="text-right">
                    <p className="text-sm font-bold text-white font-mono">{formatDuration(entry.duration_seconds || 0)}</p>
                    <p className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">
                       {entry.start_time ? formatTime(entry.start_time) : ''} - 
                       {entry.end_time ? formatTime(entry.end_time) : 'Now'}
                    </p>
                  </div>
                  <button className="p-2 text-slate-600 hover:text-white hover:bg-white/5 rounded-lg transition-all opacity-0 group-hover:opacity-100">
                    <MoreHorizontal size={20} />
                  </button>
                </div>
              </motion.div>
            ))
          ) : (
            <div className="p-20 text-center">
               <div className="w-16 h-16 bg-white/5 rounded-3xl flex items-center justify-center mx-auto mb-4 text-slate-600">
                  <Clock size={32} />
               </div>
               <p className="text-slate-400 font-medium">No time entries found for this period.</p>
               <button className="mt-4 text-primary-400 text-sm font-bold hover:underline">Start Tracking Now</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TimeTrackingPage;
