import { useState } from 'react';
import { Loader2, Sparkles, Wand2, Check, Trash2, PlayCircle } from 'lucide-react';
import { aiService, type AiAutopilotBlock } from '../../api/aiService';
import { getApiErrorMessage } from '../../utils/apiError';
import type { Project } from '../../api/projectService';

interface Props {
  projects: Project[];
  onLogged: () => void;
}

const confidenceStyle = (c: number) => {
  if (c >= 0.7) return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
  if (c >= 0.4) return 'bg-amber-500/15 text-amber-300 border-amber-500/30';
  return 'bg-slate-500/15 text-slate-300 border-slate-500/30';
};

const AutopilotPanel = ({ projects, onLogged }: Props) => {
  const today = new Date().toISOString().split('T')[0];
  const [date, setDate] = useState(today);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [blocks, setBlocks] = useState<AiAutopilotBlock[] | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [overrides, setOverrides] = useState<Record<number, string>>({});
  const [appliedCount, setAppliedCount] = useState<number | null>(null);

  const run = async () => {
    setLoading(true);
    setError(null);
    setMessage(null);
    setBlocks(null);
    setSelected(new Set());
    setOverrides({});
    setAppliedCount(null);
    try {
      const r = await aiService.autopilot(date);
      setBlocks(r.data.blocks);
      if (r.data.blocks.length === 0) {
        setMessage(r.data.message || 'Nothing to reconstruct for this day.');
      } else {
        // Pre-select every block by default.
        setSelected(new Set(r.data.blocks.map((_, i) => i)));
        const preset: Record<number, string> = {};
        r.data.blocks.forEach((b, i) => {
          if (b.project_id) preset[i] = String(b.project_id);
        });
        setOverrides(preset);
      }
    } catch (e) {
      setError(getApiErrorMessage(e, 'Could not build your day'));
    } finally {
      setLoading(false);
    }
  };

  const toggle = (idx: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const applyAll = async () => {
    if (!blocks) return;
    const entries = blocks
      .map((b, i) => ({ b, i }))
      .filter(({ i }) => selected.has(i))
      .map(({ b, i }) => ({
        suggestion_id: b.id,
        project_id: overrides[i] ? Number(overrides[i]) : b.project_id,
        description: b.description,
        started_at: b.started_at,
        ended_at: b.ended_at,
        is_billable: true,
      }));

    if (entries.length === 0) {
      setError('Select at least one block to apply.');
      return;
    }

    setApplying(true);
    setError(null);
    try {
      const r = await aiService.applyAutopilot(entries);
      setAppliedCount(r.data.created);
      setBlocks(null);
      onLogged();
    } catch (e) {
      setError(getApiErrorMessage(e, 'Failed to apply timesheet'));
    } finally {
      setApplying(false);
    }
  };

  const totalMinutes = blocks
    ? blocks.filter((_, i) => selected.has(i)).reduce((s, b) => s + b.duration_minutes, 0)
    : 0;

  return (
    <div className="glass rounded-2xl border border-white/5 shadow-ai overflow-hidden">
      <div className="p-4 border-b border-white/5 bg-gradient-to-r from-primary-500/10 to-transparent flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary-500/20 flex items-center justify-center text-primary-300">
            <Sparkles size={20} />
          </div>
          <div>
            <h3 className="font-bold text-white text-sm uppercase tracking-wider flex items-center gap-2">
              Autopilot Timesheet
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-primary-500/20 text-primary-300 border border-primary-500/30">
                AI
              </span>
            </h3>
            <p className="text-xs text-slate-500">Reconstruct your whole day, then approve it in one tap.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={date}
            max={today}
            onChange={(e) => setDate(e.target.value)}
            className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-slate-300 outline-none focus:border-primary-500/50"
          />
          <button
            onClick={run}
            disabled={loading}
            className="flex items-center gap-2 bg-primary-500 hover:bg-primary-600 disabled:opacity-60 text-white px-4 py-2 rounded-xl text-xs font-bold transition-all"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
            Build my day
          </button>
        </div>
      </div>

      <div className="p-4 space-y-3">
        {error && <p className="text-rose-400 text-sm">{error}</p>}
        {appliedCount !== null && (
          <div className="flex items-center gap-2 text-emerald-400 text-sm font-semibold">
            <Check size={16} /> Added {appliedCount} time {appliedCount === 1 ? 'entry' : 'entries'} to your timesheet.
          </div>
        )}
        {!blocks && !loading && !error && appliedCount === null && (
          <p className="text-slate-500 text-sm">
            Pick a day and Autopilot will fuse your activity, commits and Jira issues into a ready-to-approve timesheet.
          </p>
        )}
        {loading && (
          <div className="flex items-center gap-2 text-slate-400 text-sm">
            <Loader2 size={16} className="animate-spin" /> Reconstructing your day…
          </div>
        )}
        {message && <p className="text-slate-500 text-sm">{message}</p>}

        {blocks && blocks.length > 0 && (
          <>
            <div className="space-y-2">
              {blocks.map((b, idx) => {
                const isSel = selected.has(idx);
                return (
                  <div
                    key={idx}
                    className={`rounded-2xl border p-3 flex items-center gap-3 transition-all ${
                      isSel ? 'border-primary-500/30 bg-primary-500/5' : 'border-white/10 bg-white/[0.02] opacity-60'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isSel}
                      onChange={() => toggle(idx)}
                      className="rounded border-white/20 shrink-0"
                    />
                    <span className="text-xs font-mono text-primary-300 bg-primary-500/10 px-2 py-1 rounded-lg shrink-0">
                      {b.start_time}–{b.end_time}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-white text-sm truncate">{b.description}</p>
                      <p className="text-[11px] text-slate-500 truncate">
                        {Math.floor(b.duration_minutes / 60) > 0 ? `${Math.floor(b.duration_minutes / 60)}h ` : ''}
                        {b.duration_minutes % 60}m
                        {b.sources.length > 0 && ` · ${b.sources.join(', ')}`}
                      </p>
                    </div>
                    <select
                      value={overrides[idx] ?? ''}
                      onChange={(e) => setOverrides((p) => ({ ...p, [idx]: e.target.value }))}
                      className="bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-slate-300 outline-none focus:border-primary-500/50 max-w-[140px]"
                    >
                      <option value="">No project</option>
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                    <span className={`shrink-0 text-[10px] font-bold px-2 py-1 rounded-lg border ${confidenceStyle(b.confidence)}`}>
                      {Math.round(b.confidence * 100)}%
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-white/5">
              <p className="text-xs text-slate-400">
                {selected.size} of {blocks.length} selected ·{' '}
                <span className="text-slate-300 font-semibold">
                  {Math.floor(totalMinutes / 60)}h {totalMinutes % 60}m
                </span>
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setBlocks(null)}
                  className="flex items-center gap-1.5 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 px-3 py-2 rounded-xl text-xs font-bold transition-all"
                >
                  <Trash2 size={13} /> Discard
                </button>
                <button
                  onClick={applyAll}
                  disabled={applying || selected.size === 0}
                  className="flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-60 text-white px-4 py-2 rounded-xl text-xs font-bold transition-all"
                >
                  {applying ? <Loader2 size={13} className="animate-spin" /> : <PlayCircle size={13} />}
                  Approve &amp; log {selected.size > 0 ? `(${selected.size})` : ''}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default AutopilotPanel;
