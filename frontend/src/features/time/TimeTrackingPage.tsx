import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Calendar, Filter, Download, MoreHorizontal, Clock, Tag, Briefcase, Loader2, Search, AlertCircle, Plus, Pencil, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { timeService } from '../../api/timeService';
import { projectService, type Project } from '../../api/projectService';
import { taskService } from '../../api/taskService';
import { reportService } from '../../api/reportService';
import DevAiPanel from './DevAiPanel';
import { useAuthStore } from '../../store/authStore';
import { hasPermission, isOrgAdmin, canManageProjects } from '../../utils/access';
import { getApiErrorMessage } from '../../utils/apiError';
import { Button, Input, Modal } from '../../components/ui';
import type { Task, TimeEntry } from '../../types';

const TimeTrackingPage = () => {
  const { user } = useAuthStore();
  const canManualEntry = hasPermission(user, 'time.manual_entry');
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [showManualModal, setShowManualModal] = useState(false);
  const [editingEntry, setEditingEntry] = useState<TimeEntry | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [entryForm, setEntryForm] = useState({
    project_id: '',
    task_id: '',
    description: '',
    started_at: '',
    ended_at: '',
    is_billable: true,
  });
  const [menuEntryId, setMenuEntryId] = useState<number | null>(null);
  
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
      setEntries([]);
    } finally {
      setLoading(false);
    }
  };

  const loadTasksForProject = async (projectId: string) => {
    if (!projectId) {
      setTasks([]);
      return;
    }
    try {
      const resp = await taskService.getAll({ project_id: Number(projectId), is_active: 1 });
      setTasks(resp.data ?? []);
    } catch {
      setTasks([]);
    }
  };

  const openManualModal = (entry?: TimeEntry) => {
    setEditingEntry(entry ?? null);
    setFormError(null);
    if (entry) {
      const start = entry.started_at_local ?? entry.started_at;
      const end = entry.ended_at_local ?? entry.ended_at;
      setEntryForm({
        project_id: entry.project_id ? String(entry.project_id) : '',
        task_id: entry.task_id ? String(entry.task_id) : '',
        description: entry.description ?? '',
        started_at: start ? start.replace(' ', 'T').slice(0, 16) : '',
        ended_at: end ? end.replace(' ', 'T').slice(0, 16) : '',
        is_billable: !!(entry as any).is_billable,
      });
      if (entry.project_id) loadTasksForProject(String(entry.project_id));
    } else {
      setEntryForm({
        project_id: projects[0]?.id ? String(projects[0].id) : '',
        task_id: '',
        description: '',
        started_at: '',
        ended_at: '',
        is_billable: true,
      });
      if (projects[0]?.id) loadTasksForProject(String(projects[0].id));
    }
    setShowManualModal(true);
  };

  const handleSaveEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      const payload = {
        project_id: entryForm.project_id ? Number(entryForm.project_id) : undefined,
        task_id: entryForm.task_id ? Number(entryForm.task_id) : undefined,
        description: entryForm.description,
        started_at: entryForm.started_at.replace('T', ' ') + ':00',
        ended_at: entryForm.ended_at.replace('T', ' ') + ':00',
        is_billable: entryForm.is_billable,
      };
      if (editingEntry) {
        await timeService.updateEntry(editingEntry.id, payload);
      } else {
        await timeService.createManual(payload);
      }
      setShowManualModal(false);
      await fetchEntries();
    } catch (err) {
      setFormError(getApiErrorMessage(err, 'Failed to save entry'));
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteEntry = async (entry: TimeEntry) => {
    if (!confirm('Delete this time entry?')) return;
    try {
      await timeService.deleteEntry(entry.id);
      await fetchEntries();
    } catch (err) {
      setFormError(getApiErrorMessage(err, 'Failed to delete entry'));
    }
    setMenuEntryId(null);
  };

  const formatDuration = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${h}h ${m}m`;
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr.includes('T') ? dateStr : dateStr.replace(' ', 'T') + 'Z');
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr.includes('T') ? dateStr : dateStr.replace(' ', 'T') + 'Z');
    return new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
  };

  const displayStart = (entry: TimeEntry) => entry.started_at_local ?? entry.started_at;
  const displayEnd = (entry: TimeEntry) => entry.ended_at_local ?? entry.ended_at;

  const getProjectName = (id?: number) => {
    if (!id) return 'General';
    return projects.find(p => p.id === id)?.name || `Project ${id}`;
  };

  const filteredEntries = entries.filter(e => 
    e.description?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-8">
      {projects.length === 0 && (
        <div className="flex items-center gap-3 bg-amber-500/10 border border-amber-500/20 rounded-2xl px-5 py-4">
          <AlertCircle size={18} className="text-amber-400 shrink-0" />
          <p className="text-sm text-amber-200">
            {isOrgAdmin(user)
              ? 'No projects yet. Create your first project to start tracking time.'
              : 'No projects available. Ask your admin to create a project.'}
          </p>
          {canManageProjects(user) && (
            <Link to="/projects" className="text-xs font-bold text-amber-300 hover:underline whitespace-nowrap ml-auto">
              Create project
            </Link>
          )}
        </div>
      )}

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Time Logs</h1>
          <p className="text-slate-400">Review and manage your tracked time entries.</p>
        </div>
        <div className="flex items-center gap-3">
          {canManualEntry && (
            <Button onClick={() => openManualModal()} className="!rounded-xl">
              <Plus size={18} className="mr-2" />
              Manual Entry
            </Button>
          )}
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
          <button
            onClick={() => reportService.exportCsv('time_logs.csv', filteredEntries.map((entry) => ({
              id: entry.id,
              description: entry.description,
              project_id: entry.project_id,
              started_at: entry.started_at,
              ended_at: entry.ended_at,
              duration_seconds: entry.duration_seconds,
            })))}
            className="flex items-center gap-2 bg-primary-500 hover:bg-primary-600 text-white px-5 py-2.5 rounded-xl font-bold transition-all shadow-ai"
          >
            <Download size={18} />
            Export
          </button>
        </div>
      </div>

      {canManualEntry && <DevAiPanel projects={projects} onLogged={fetchEntries} />}

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
                        {(entry as any).is_billable ? 'Billable' : 'Non-billable'}
                      </div>
                      <div className="flex items-center gap-1">
                        <Calendar size={14} />
                        {entry.started_at ? formatDate(displayStart(entry)) : 'No Date'}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-8 pl-16 md:pl-0">
                  <div className="text-right">
                    <p className="text-sm font-bold text-white font-mono">{formatDuration(entry.duration_seconds || 0)}</p>
                    <p className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">
                       {entry.started_at ? formatTime(displayStart(entry)) : ''} - 
                       {entry.ended_at ? formatTime(displayEnd(entry)!) : 'Now'}
                    </p>
                  </div>
                  <button
                    onClick={() => setMenuEntryId(menuEntryId === entry.id ? null : entry.id)}
                    className={`p-2 text-slate-600 hover:text-white hover:bg-white/5 rounded-lg transition-all relative ${canManualEntry ? 'opacity-0 group-hover:opacity-100' : 'hidden'}`}
                  >
                    <MoreHorizontal size={20} />
                    {menuEntryId === entry.id && (
                      <div className="absolute right-0 top-full mt-1 z-20 w-36 glass border border-white/10 rounded-xl overflow-hidden shadow-2xl">
                        <button
                          onClick={() => { setMenuEntryId(null); openManualModal(entry); }}
                          className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-slate-300 hover:bg-white/10"
                        >
                          <Pencil size={14} /> Edit
                        </button>
                        <button
                          onClick={() => handleDeleteEntry(entry)}
                          className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-rose-400 hover:bg-rose-500/10"
                        >
                          <Trash2 size={14} /> Delete
                        </button>
                      </div>
                    )}
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

      <Modal
        open={showManualModal}
        onClose={() => setShowManualModal(false)}
        title={editingEntry ? 'Edit Time Entry' : 'Manual Time Entry'}
      >
        <form onSubmit={handleSaveEntry} className="space-y-4">
          {formError && <p className="text-rose-400 text-sm">{formError}</p>}
          <select
            value={entryForm.project_id}
            onChange={(e) => {
              setEntryForm((f) => ({ ...f, project_id: e.target.value, task_id: '' }));
              loadTasksForProject(e.target.value);
            }}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none"
          >
            <option value="">No project</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <select
            value={entryForm.task_id}
            onChange={(e) => setEntryForm((f) => ({ ...f, task_id: e.target.value }))}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none"
          >
            <option value="">No task</option>
            {tasks.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          <Input
            placeholder="Description"
            value={entryForm.description}
            onChange={(e) => setEntryForm((f) => ({ ...f, description: e.target.value }))}
          />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-500 uppercase font-bold mb-1 block">Start</label>
              <input
                required
                type="datetime-local"
                value={entryForm.started_at}
                onChange={(e) => setEntryForm((f) => ({ ...f, started_at: e.target.value }))}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none"
              />
            </div>
            <div>
              <label className="text-xs text-slate-500 uppercase font-bold mb-1 block">End</label>
              <input
                required
                type="datetime-local"
                value={entryForm.ended_at}
                onChange={(e) => setEntryForm((f) => ({ ...f, ended_at: e.target.value }))}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none"
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={entryForm.is_billable}
              onChange={(e) => setEntryForm((f) => ({ ...f, is_billable: e.target.checked }))}
              className="rounded border-white/20"
            />
            Billable
          </label>
          <Button type="submit" isLoading={saving} className="w-full">
            {editingEntry ? 'Save changes' : 'Add entry'}
          </Button>
        </form>
      </Modal>
    </div>
  );
};

export default TimeTrackingPage;
