import { useEffect, useState } from 'react';
import {
  Sparkles, Github, Trello, Loader2, Plus, Check, Wand2, ArrowRight, Plug,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { aiService, type AiSuggestion } from '../../api/aiService';
import { timeService } from '../../api/timeService';
import { getApiErrorMessage } from '../../utils/apiError';
import type { Project } from '../../api/projectService';
import AutopilotPanel from './AutopilotPanel';
import CalendarPanel from './CalendarPanel';

interface Props {
  projects: Project[];
  onLogged: () => void;
}

const pad = (n: number) => String(n).padStart(2, '0');
const fmt = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:00`;

const confidenceStyle = (c: number) => {
  if (c >= 0.7) return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
  if (c >= 0.4) return 'bg-amber-500/15 text-amber-300 border-amber-500/30';
  return 'bg-slate-500/15 text-slate-300 border-slate-500/30';
};

const linkClass =
  'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all';

const DevAiPanel = ({ projects, onLogged }: Props) => {
  const today = new Date().toISOString().split('T')[0];

  const [aiEnabled, setAiEnabled] = useState<boolean | null>(null);
  const [date, setDate] = useState(today);
  const [loadingSuggest, setLoadingSuggest] = useState(false);
  const [suggestions, setSuggestions] = useState<AiSuggestion[] | null>(null);
  const [suggestMsg, setSuggestMsg] = useState<string | null>(null);
  const [suggestError, setSuggestError] = useState<string | null>(null);
  const [addedIdx, setAddedIdx] = useState<Set<number>>(new Set());
  const [suggestProjects, setSuggestProjects] = useState<Record<number, string>>({});

  useEffect(() => {
    aiService.status().then((r) => setAiEnabled(!!r.data.enabled)).catch(() => setAiEnabled(false));
  }, []);

  const runSuggest = async () => {
    setLoadingSuggest(true);
    setSuggestError(null);
    setSuggestMsg(null);
    setSuggestions(null);
    setAddedIdx(new Set());
    setSuggestProjects({});
    try {
      const r = await aiService.categorize(date);
      setSuggestions(r.data.suggestions);
      if (r.data.suggestions.length === 0) {
        setSuggestMsg(r.data.message || 'No suggestions for this day.');
      }
      const preset: Record<number, string> = {};
      r.data.suggestions.forEach((s, i) => {
        if (s.project_id) preset[i] = String(s.project_id);
      });
      setSuggestProjects(preset);
    } catch (e) {
      setSuggestError(getApiErrorMessage(e, 'Could not generate suggestions'));
    } finally {
      setLoadingSuggest(false);
    }
  };

  const addSuggestion = async (s: AiSuggestion, idx: number) => {
    try {
      const end = new Date(`${date}T18:00:00`);
      const start = new Date(end.getTime() - s.duration_minutes * 60000);
      const projectId = suggestProjects[idx];
      await timeService.createManual({
        project_id: projectId ? Number(projectId) : undefined,
        description: s.description,
        started_at: fmt(start),
        ended_at: fmt(end),
        is_billable: true,
      });
      setAddedIdx((prev) => new Set(prev).add(idx));
      onLogged();
    } catch (e) {
      setSuggestError(getApiErrorMessage(e, 'Failed to add entry'));
    }
  };

  const showAi = aiEnabled !== false;

  return (
    <section className="rounded-2xl border border-white/5 bg-white/[0.02] overflow-hidden">
      {/* Toolbar */}
      <div className="px-4 py-3 border-b border-white/5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-white">Smart logging</p>
          <p className="text-[11px] text-slate-500">AI-assisted entries & connected tools</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link to="/integrations/jira" className={`${linkClass} border-[#0052CC]/30 bg-[#0052CC]/10 text-[#8cb8ff] hover:bg-[#0052CC]/20`}>
            <Trello size={13} /> Jira <ArrowRight size={12} className="opacity-60" />
          </Link>
          <Link to="/integrations/github" className={`${linkClass} border-white/10 bg-white/5 text-slate-200 hover:bg-white/10`}>
            <Github size={13} /> GitHub <ArrowRight size={12} className="opacity-60" />
          </Link>
          <Link to="/integrations" className={`${linkClass} border-primary-500/20 bg-primary-500/10 text-primary-300 hover:bg-primary-500/15`}>
            <Plug size={13} /> Integrations
          </Link>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {showAi && <AutopilotPanel projects={projects} onLogged={onLogged} />}

        <div className={`grid grid-cols-1 gap-4 ${showAi ? 'lg:grid-cols-2' : ''}`}>
          {showAi && (
            <div className="glass rounded-2xl border border-white/5 overflow-hidden h-full flex flex-col">
              <div className="p-4 border-b border-white/5 bg-white/[0.02] flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-xl bg-primary-500/10 flex items-center justify-center text-primary-400">
                    <Sparkles size={18} />
                  </div>
                  <div>
                    <h3 className="font-bold text-white text-sm">AI Time Suggestions</h3>
                    <p className="text-[11px] text-slate-500">Activity → time entries</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={date}
                    max={today}
                    onChange={(e) => setDate(e.target.value)}
                    className="bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-slate-300 outline-none focus:border-primary-500/50"
                  />
                  <button
                    onClick={runSuggest}
                    disabled={loadingSuggest}
                    className="flex items-center gap-1.5 bg-primary-500 hover:bg-primary-600 disabled:opacity-60 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
                  >
                    {loadingSuggest ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
                    Suggest
                  </button>
                </div>
              </div>

              <div className="p-4 space-y-2 flex-1 max-h-56 overflow-y-auto">
                {suggestError && <p className="text-rose-400 text-sm">{suggestError}</p>}
                {!suggestions && !loadingSuggest && !suggestError && (
                  <p className="text-slate-500 text-sm">Pick a day and generate suggestions.</p>
                )}
                {loadingSuggest && (
                  <div className="flex items-center gap-2 text-slate-400 text-sm">
                    <Loader2 size={16} className="animate-spin" /> Analyzing…
                  </div>
                )}
                {suggestMsg && <p className="text-slate-500 text-sm">{suggestMsg}</p>}

                {suggestions?.map((s, idx) => (
                  <div key={idx} className="rounded-xl border border-white/10 bg-white/[0.02] p-3 flex flex-col gap-2">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-white font-semibold text-sm line-clamp-2">{s.description}</p>
                      <span className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-lg border ${confidenceStyle(s.confidence)}`}>
                        {Math.round(s.confidence * 100)}%
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-mono text-primary-300 bg-primary-500/10 px-2 py-0.5 rounded-lg">
                        {Math.floor(s.duration_minutes / 60) > 0 ? `${Math.floor(s.duration_minutes / 60)}h ` : ''}
                        {s.duration_minutes % 60}m
                      </span>
                      <select
                        value={suggestProjects[idx] ?? ''}
                        onChange={(e) => setSuggestProjects((p) => ({ ...p, [idx]: e.target.value }))}
                        className="flex-1 min-w-0 bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-xs text-slate-300"
                      >
                        <option value="">No project</option>
                        {projects.map((p) => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                      {addedIdx.has(idx) ? (
                        <span className="flex items-center gap-1 text-emerald-400 text-xs font-bold"><Check size={14} /> Added</span>
                      ) : (
                        <button
                          onClick={() => addSuggestion(s, idx)}
                          className="flex items-center gap-1 bg-white/5 hover:bg-white/10 border border-white/10 text-white px-2 py-1 rounded-lg text-xs font-bold"
                        >
                          <Plus size={13} /> Add
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <CalendarPanel projects={projects} onLogged={onLogged} />
        </div>
      </div>
    </section>
  );
};

export default DevAiPanel;
