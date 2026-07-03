import { useEffect, useState } from 'react';
import { CalendarDays, Loader2, RefreshCw, Plus, Check, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { calendarService, type CalendarEventsResult } from '../../api/calendarService';
import { getApiErrorMessage } from '../../utils/apiError';
import type { Project } from '../../api/projectService';

interface Props {
  projects: Project[];
  onLogged: () => void;
}

const clock = (local: string | null) => (local ? local.slice(11, 16) : '');

const CalendarPanel = ({ projects, onLogged }: Props) => {
  const today = new Date().toISOString().split('T')[0];
  const [date, setDate] = useState(today);
  const [data, setData] = useState<CalendarEventsResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [projectId, setProjectId] = useState('');
  const [loggedIds, setLoggedIds] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async (d = date) => {
    setLoading(true);
    setError(null);
    try {
      const r = await calendarService.events(d);
      setData(r.data);
      setLoggedIds(new Set());
    } catch (e) {
      setError(getApiErrorMessage(e, 'Failed to load calendar'));
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load(date);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const log = async (ev: { id: string; title: string; started_at: string | null; ended_at: string | null }) => {
    if (!ev.started_at || !ev.ended_at) return;
    setBusyId(ev.id);
    try {
      await calendarService.logTime({
        title: ev.title,
        started_at: ev.started_at,
        ended_at: ev.ended_at,
        project_id: projectId ? Number(projectId) : undefined,
        is_billable: true,
      });
      setLoggedIds((prev) => new Set(prev).add(ev.id));
      onLogged();
    } catch (e) {
      setError(getApiErrorMessage(e, 'Failed to log meeting'));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="glass rounded-3xl border border-white/5 shadow-ai overflow-hidden">
      <div className="p-6 border-b border-white/5 bg-white/[0.02] flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-[#1a73e8]/20 flex items-center justify-center text-[#8ab4f8]">
            <CalendarDays size={20} />
          </div>
          <div>
            <h3 className="font-bold text-white text-sm uppercase tracking-wider">Calendar Meetings</h3>
            <p className="text-xs text-slate-500">
              {data?.connected ? (data.account ? `${data.account}` : 'Log meetings as time') : 'Turn meetings into time.'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={date}
            max={today}
            onChange={(e) => { setDate(e.target.value); void load(e.target.value); }}
            className="bg-white/5 border border-white/10 rounded-xl px-2 py-1.5 text-xs text-slate-300 outline-none focus:border-primary-500/50"
          />
          <button
            onClick={() => load()}
            disabled={loading}
            className="p-2 text-slate-500 hover:text-white hover:bg-white/5 rounded-lg transition-all"
            title="Refresh"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      <div className="p-6 space-y-3 min-h-[120px]">
        {error && <p className="text-rose-400 text-sm">{error}</p>}

        {loading ? (
          <div className="flex items-center gap-2 text-slate-400 text-sm">
            <Loader2 size={16} className="animate-spin" /> Loading calendar…
          </div>
        ) : data && !data.connected ? (
          <div className="text-sm text-slate-400">
            No calendar connected yet.{' '}
            <Link to="/settings?tab=integrations" className="text-primary-400 font-bold hover:underline">
              Connect Google or Outlook in Settings → Integrations
            </Link>{' '}
            to log meetings automatically.
          </div>
        ) : data && data.events.length > 0 ? (
          <>
            <div className="flex flex-wrap items-center gap-2 pb-1">
              <span className="text-[10px] text-slate-500 uppercase font-bold">Log as</span>
              <select
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-slate-300 outline-none focus:border-primary-500/50"
              >
                <option value="">No project</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            {data.events.map((ev) => (
              <div key={ev.id} className="rounded-2xl border border-white/10 bg-white/[0.02] p-3 flex items-center gap-3">
                <CalendarDays size={16} className="text-[#8ab4f8] shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-white text-sm truncate">{ev.title}</p>
                  <p className="text-[11px] text-slate-500 truncate flex items-center gap-2">
                    <span>{clock(ev.start_local)}–{clock(ev.end_local)} · {ev.minutes}m</span>
                    {ev.attendees > 0 && (
                      <span className="inline-flex items-center gap-0.5"><Users size={11} /> {ev.attendees}</span>
                    )}
                  </p>
                </div>
                {ev.all_day || !ev.started_at ? (
                  <span className="text-[11px] text-slate-600 shrink-0">all-day</span>
                ) : loggedIds.has(ev.id) ? (
                  <span className="flex items-center gap-1 text-emerald-400 text-xs font-bold shrink-0"><Check size={14} /> Logged</span>
                ) : (
                  <button
                    onClick={() => log(ev)}
                    disabled={busyId === ev.id}
                    className="flex items-center gap-1 bg-white/5 hover:bg-white/10 border border-white/10 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0"
                  >
                    {busyId === ev.id ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} Log
                  </button>
                )}
              </div>
            ))}
          </>
        ) : (
          <p className="text-slate-500 text-sm">No meetings found for this day.</p>
        )}
      </div>
    </div>
  );
};

export default CalendarPanel;
