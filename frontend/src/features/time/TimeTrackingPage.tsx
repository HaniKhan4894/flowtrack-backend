import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Calendar, Filter, Download, MoreHorizontal, Clock, Tag, Briefcase, Loader2, ChevronDown, Search } from 'lucide-react';
import { timeService } from '../../api/timeService';
import { projectService, type Project } from '../../api/projectService';
import type { TimeEntry } from '../../types';

const TimeTrackingPage = () => {
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Filters
  const [selectedProjectId, setSelectedProjectId] = useState<string>('all');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchProjects();
  }, []);

  useEffect(() => {
    fetchEntries();
  }, [selectedProjectId, startDate, endDate]);

  const fetchProjects = async () => {
    try {
      const resp = await projectService.getAll();
      setProjects(resp.data);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchEntries = async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (selectedProjectId !== 'all') params.project_id = selectedProjectId;
      if (startDate) params.start_date = startDate;
      if (endDate) params.end_date = endDate;

      const resp = await timeService.getAll(params);
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

  const getProjectName = (id?: number) => {
    if (!id) return 'General';
    return projects.find(p => p.id === id)?.name || `Project ${id}`;
  };

  const filteredEntries = entries.filter(e => 
    e.description?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Time Logs</h1>
          <p className="text-slate-400">Review and manage your tracked time entries.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex bg-white/5 rounded-xl border border-white/10 p-1">
            <button 
              onClick={() => {
                const today = new Date().toISOString().split('T')[0];
                setStartDate(today);
                setEndDate(today);
              }}
              className="px-3 py-1.5 text-xs font-bold text-slate-400 hover:text-white rounded-lg transition-all"
            >
              Today
            </button>
            <button 
              onClick={() => {
                const d = new Date();
                d.setDate(d.getDate() - 7);
                setStartDate(d.toISOString().split('T')[0]);
                setEndDate(new Date().toISOString().split('T')[0]);
              }}
              className="px-3 py-1.5 text-xs font-bold text-slate-400 hover:text-white rounded-lg transition-all"
            >
              Last 7 Days
            </button>
          </div>
          <button className="flex items-center gap-2 bg-primary-500 hover:bg-primary-600 text-white px-5 py-2.5 rounded-xl font-bold transition-all shadow-ai">
            <Download size={18} />
            Export
          </button>
        </div>
      </div>

      <div className="glass rounded-3xl overflow-hidden border border-white/5 shadow-ai">
        <div className="p-6 border-b border-white/5 bg-white/[0.02] space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="h-10 w-10 rounded-xl bg-primary-500/10 flex items-center justify-center text-primary-400 text-bold shadow-inner">
                <Filter size={20} />
              </div>
              <span className="font-bold text-white uppercase tracking-wider text-sm">Filters</span>
            </div>
            
            <div className="flex flex-wrap items-center gap-3">
               <div className="relative">
                 <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                 <input 
                   type="text"
                   placeholder="Search description..."
                   className="bg-white/5 border border-white/10 rounded-xl pl-9 pr-4 py-2 text-xs text-white outline-none focus:border-primary-500/50 w-48"
                   value={searchTerm}
                   onChange={(e) => setSearchTerm(e.target.value)}
                 />
               </div>

               <select 
                 className="bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-xs text-slate-300 outline-none focus:border-primary-500/50"
                 value={selectedProjectId}
                 onChange={(e) => setSelectedProjectId(e.target.value)}
               >
                 <option value="all">All Projects</option>
                 {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
               </select>

               <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-3 py-1.5">
                  <Calendar size={14} className="text-slate-500" />
                  <input 
                    type="date" 
                    className="bg-transparent border-0 text-[10px] text-slate-300 p-0 focus:ring-0 uppercase font-bold"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                  <span className="text-slate-600">to</span>
                  <input 
                    type="date" 
                    className="bg-transparent border-0 text-[10px] text-slate-300 p-0 focus:ring-0 uppercase font-bold"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                  />
                  {(startDate || endDate) && (
                    <button onClick={() => { setStartDate(''); setEndDate(''); }} className="text-slate-500 hover:text-white ml-1">
                      <Filter size={12} fill="currentColor" />
                    </button>
                  )}
               </div>
            </div>
          </div>
        </div>

        <div className="divide-y divide-white/5">
          {loading ? (
             <div className="p-20 flex justify-center"><Loader2 className="w-8 h-8 text-primary-500 animate-spin" /></div>
          ) : filteredEntries.length > 0 ? (
            filteredEntries.map((entry) => (
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
                        {getProjectName(entry.project_id)}
                      </div>
                      <div className="flex items-center gap-1">
                        <Tag size={14} />
                        {entry.is_billable ? 'Billable' : 'Non-billable'}
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
               <button onClick={() => { setSelectedProjectId('all'); setStartDate(''); setEndDate(''); setSearchTerm(''); }} className="mt-4 text-primary-400 text-sm font-bold hover:underline">Clear all filters</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TimeTrackingPage;
