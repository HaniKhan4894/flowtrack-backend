import { useState, useEffect } from 'react';
import { Play, Square, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTimerStore } from '../store/timerStore';
import { projectService, type Project } from '../api/projectService';

export const TimerWidget = () => {
  const { activeEntry, isRunning, elapsed, start, stop, loadActive } = useTimerStore();
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [description, setDescription] = useState('');
  const [showProjectSelect, setShowProjectSelect] = useState(false);

  useEffect(() => {
    loadActive();
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    try {
      const resp = await projectService.getAll();
      setProjects(resp.data);
      if (resp.data.length > 0) setSelectedProjectId(resp.data[0].id);
    } catch (e) {
      console.error(e);
    }
  };

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const handleToggle = async () => {
    if (isRunning) {
      await stop();
    } else {
      if (selectedProjectId) {
        await start(selectedProjectId, description);
      }
    }
  };

  return (
    <div className="flex items-center gap-4 bg-white/5 border border-white/10 rounded-2xl px-4 py-2 glass shadow-ai">
      {!isRunning ? (
        <div className="flex items-center gap-3">
          <div className="relative">
            <button 
              onClick={() => setShowProjectSelect(!showProjectSelect)}
              className="flex items-center gap-2 text-xs font-bold text-slate-400 hover:text-white transition-colors uppercase tracking-wider bg-white/5 px-3 py-1.5 rounded-lg"
            >
              {projects.find(p => p.id === selectedProjectId)?.name || 'Select Project'}
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
                  {projects.map(p => (
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
            <span className="text-[10px] uppercase font-bold text-primary-400 tracking-tighter">Recording...</span>
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
        
        <button
          onClick={handleToggle}
          className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-300 ${
            isRunning 
              ? 'bg-accent/20 text-accent hover:bg-accent/30 shadow-[0_0_15px_rgba(244,63,94,0.3)]' 
              : 'bg-primary-500 text-white hover:scale-105 shadow-ai'
          }`}
        >
          {isRunning ? <Square size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" className="ml-0.5" />}
        </button>
      </div>
    </div>
  );
};
