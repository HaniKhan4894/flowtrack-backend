import { useState, useEffect, useCallback } from 'react';
import { Play, Square, ChevronDown, Pause, Download, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import { useTimerStore } from '../store/timerStore';
import { projectService, type Project } from '../api/projectService';
import { monitoringService } from '../api/monitoringService';
import { useAuthStore } from '../store/authStore';
import { isOrgAdmin } from '../utils/access';
import { getApiErrorMessage } from '../utils/apiError';

export const TimerWidget = () => {
  const isDesktop = monitoringService.isDesktop;
  const { user } = useAuthStore();
  const { activeEntry, isRunning, isPaused, elapsed, start, stop, pause, resume, loadActive } = useTimerStore();
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [description, setDescription] = useState('');
  const [showProjectSelect, setShowProjectSelect] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchProjects = useCallback(async () => {
    try {
      const resp = await projectService.getAll();
      setProjects(resp.data);
      if (resp.data.length > 0) setSelectedProjectId(resp.data[0].id);
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    loadActive();
    fetchProjects();
  }, [fetchProjects, loadActive]);

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const handleToggle = async () => {
    setError(null);
    try {
      if (isRunning) {
        await stop();
      } else {
        if (!selectedProjectId) {
          setError('Please select a project first');
          return;
        }
        await start(selectedProjectId, description);
      }
    } catch (e: unknown) {
      setError(getApiErrorMessage(e, 'Timer action failed'));
    }
  };

  const noProjects = projects.length === 0;

  if (!isDesktop) {
    return (
      <div className="flex items-center gap-3">
        {isRunning && (
          <div className="flex items-center gap-4 bg-white/5 border border-white/10 rounded-2xl px-4 py-2 glass shadow-ai">
            <div className="flex flex-col">
              <span className={`text-[10px] uppercase font-bold tracking-tighter ${isPaused ? 'text-amber-500' : 'text-primary-400'}`}>
                {isPaused ? 'Paused' : 'Recording...'}
              </span>
              <span className="text-sm font-medium text-white truncate max-w-[150px]">
                {activeEntry?.description || 'Active Session'}
              </span>
            </div>
            <div className="h-8 w-px bg-white/10" />
            <div className="font-mono text-xl font-bold bg-ai-gradient bg-clip-text text-transparent min-w-[100px] text-center">
              {formatTime(elapsed)}
            </div>
          </div>
        )}
        <a
          href="/#download"
          className="flex items-center gap-2 text-xs font-bold text-primary-400 bg-primary-500/10 border border-primary-500/20 px-3 py-2 rounded-xl hover:bg-primary-500/20 transition-colors"
        >
          <Download size={14} />
          Download desktop app to start timer
        </a>
      </div>
    );
  }

  if (noProjects && !isRunning) {
    return (
      <div className="flex items-center gap-3 bg-amber-500/10 border border-amber-500/20 rounded-2xl px-4 py-2">
        <AlertCircle size={16} className="text-amber-400 shrink-0" />
        <span className="text-xs text-amber-200">
          {isOrgAdmin(user)
            ? 'Create your first project to start tracking.'
            : 'Ask your admin to create a project.'}
        </span>
        {isOrgAdmin(user) && (
          <Link to="/projects" className="text-xs font-bold text-amber-300 hover:underline whitespace-nowrap">
            Create project
          </Link>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-4 bg-white/5 border border-white/10 rounded-2xl px-4 py-2 glass shadow-ai">
      {error && <span className="text-xs text-rose-400 max-w-[200px]">{error}</span>}
      {!isRunning ? (
        <div className="flex items-center gap-3">
          <div className="relative">
            <button
              onClick={() => setShowProjectSelect(!showProjectSelect)}
              className="flex items-center gap-2 text-xs font-bold text-slate-400 hover:text-white transition-colors uppercase tracking-wider bg-white/5 px-3 py-1.5 rounded-lg"
            >
              {projects.find((p) => p.id === selectedProjectId)?.name || 'Select Project'}
              <ChevronDown size={14} />
            </button>

            <AnimatePresence>
              {showProjectSelect && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className="absolute top-full mt-2 left-0 w-48 bg-[#1A1C26] border border-white/10 rounded-xl overflow-hidden z-50 shadow-2xl"
                >
                  {projects.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => {
                        setSelectedProjectId(p.id);
                        setShowProjectSelect(false);
                      }}
                      className="w-full text-left px-4 py-2.5 text-sm text-slate-300 hover:bg-primary-500/10 hover:text-primary-400 transition-colors border-b border-white/5 last:border-0"
                    >
                      {p.name}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <input
            type="text"
            placeholder="What are you working on?"
            className="bg-transparent border-0 text-sm text-white placeholder:text-slate-600 focus:ring-0 w-40 md:w-64"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
      ) : (
        <div className="flex items-center gap-4">
          <div className="flex flex-col">
            <span className={`text-[10px] uppercase font-bold tracking-tighter ${isPaused ? 'text-amber-500' : 'text-primary-400'}`}>
              {isPaused ? 'Paused' : 'Recording...'}
            </span>
            <span className="text-sm font-medium text-white truncate max-w-[150px]">
              {activeEntry?.description || 'Active Session'}
            </span>
          </div>
          <div className="h-8 w-px bg-white/10 mx-2" />
        </div>
      )}

      <div className="flex items-center gap-4">
        <div className="font-mono text-xl font-bold bg-ai-gradient bg-clip-text text-transparent min-w-[100px] text-center">
          {formatTime(elapsed)}
        </div>

        <div className="flex items-center gap-2">
          {isRunning && (
            <button
              onClick={isPaused ? resume : pause}
              className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-300 ${
                isPaused ? 'bg-primary-500 text-white shadow-ai' : 'bg-white/10 text-white hover:bg-white/20'
              }`}
            >
              {isPaused ? <Play size={20} fill="currentColor" /> : <Pause size={20} fill="currentColor" />}
            </button>
          )}

          <button
            onClick={handleToggle}
            disabled={!isRunning && !selectedProjectId}
            className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-300 ${
              isRunning
                ? 'bg-accent/20 text-accent hover:bg-accent/30 shadow-[0_0_15px_rgba(244,63,94,0.3)]'
                : 'bg-primary-500 text-white hover:scale-105 shadow-ai'
            } disabled:opacity-50`}
          >
            {isRunning ? <Square size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" className="ml-0.5" />}
          </button>
        </div>
      </div>
    </div>
  );
};
