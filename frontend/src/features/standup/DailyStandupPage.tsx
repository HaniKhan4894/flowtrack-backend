import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { MessageSquare, Loader2, Wand2, Clock, Gauge, ListChecks, AlertCircle, Slack, Check, Radio } from 'lucide-react';
import { aiService, type AiStandupResult } from '../../api/aiService';
import { slackService } from '../../api/slackService';
import { teamService, type TeamMember } from '../../api/teamService';
import { reportService, type ActiveSession } from '../../api/reportService';
import { useAuthStore } from '../../store/authStore';
import { canViewTeam } from '../../utils/access';
import { getApiErrorMessage } from '../../utils/apiError';
import { Avatar } from '../../components/ui';

/** Minimal, safe markdown renderer for **bold** + bullet lists + headings. */
const renderInline = (text: string) => {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) =>
    p.startsWith('**') && p.endsWith('**') ? (
      <strong key={i} className="text-white font-semibold">{p.slice(2, -2)}</strong>
    ) : (
      <span key={i}>{p}</span>
    ),
  );
};

const Markdown = ({ text }: { text: string }) => {
  const lines = text.split('\n');
  return (
    <div className="space-y-1.5 text-sm text-slate-300 leading-relaxed">
      {lines.map((line, i) => {
        const trimmed = line.trim();
        if (trimmed === '') return <div key={i} className="h-1" />;
        if (/^[-*]\s+/.test(trimmed)) {
          return (
            <div key={i} className="flex gap-2 pl-1">
              <span className="text-primary-400 mt-0.5">•</span>
              <span>{renderInline(trimmed.replace(/^[-*]\s+/, ''))}</span>
            </div>
          );
        }
        return <p key={i}>{renderInline(trimmed)}</p>;
      })}
    </div>
  );
};

const DailyStandupPage = () => {
  const user = useAuthStore((s) => s.user);
  const isManager = canViewTeam(user);
  const today = new Date().toISOString().split('T')[0];

  const [aiEnabled, setAiEnabled] = useState<boolean | null>(null);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<number>(user?.id ?? 0);
  const [date, setDate] = useState(today);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AiStandupResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [slackState, setSlackState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [slackNote, setSlackNote] = useState<string | null>(null);
  const [presence, setPresence] = useState<ActiveSession[]>([]);

  useEffect(() => {
    aiService.status().then((r) => setAiEnabled(!!r.data.enabled)).catch(() => setAiEnabled(false));
    if (isManager) {
      teamService.getAll().then((r) => setMembers(r.data)).catch(() => setMembers([]));
    }
  }, [isManager]);

  useEffect(() => {
    if (!isManager) return;
    const load = () => {
      reportService.getActiveSessions()
        .then((r) => setPresence(r.data ?? []))
        .catch(() => setPresence([]));
    };
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [isManager]);

  const generate = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    setSlackState('idle');
    setSlackNote(null);
    try {
      const r = await aiService.standup(date, selectedUserId || undefined);
      setResult(r.data);
    } catch (e) {
      setError(getApiErrorMessage(e, 'Could not generate the standup'));
    } finally {
      setLoading(false);
    }
  };

  const sendToSlack = async () => {
    if (!result) return;
    setSlackState('sending');
    setSlackNote(null);
    try {
      // Slack mrkdwn uses single asterisks for bold.
      const text = `*Standup — ${result.user.name} (${result.date})*\n\n`
        + result.standup.replace(/\*\*(.+?)\*\*/g, '*$1*');
      await slackService.send(text);
      setSlackState('sent');
    } catch (e) {
      setSlackState('idle');
      setSlackNote(getApiErrorMessage(e, 'Could not send to Slack'));
    }
  };

  const trackedHours = useMemo(() => {
    if (!result) return '0h 0m';
    const m = result.stats.tracked_minutes;
    return `${Math.floor(m / 60)}h ${m % 60}m`;
  }, [result]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-white mb-2 flex items-center gap-3">
          <MessageSquare className="text-primary-400" /> Daily Standup
        </h1>
        <p className="text-slate-400">AI-written work summaries grounded in real tracked time — no manual updates.</p>
      </div>

      {aiEnabled === false && (
        <div className="flex items-center gap-3 bg-amber-500/10 border border-amber-500/20 rounded-2xl px-5 py-4">
          <AlertCircle size={18} className="text-amber-400 shrink-0" />
          <p className="text-sm text-amber-200">
            AI isn't configured. Add your OpenAI key in Settings → Integrations to generate standups.
          </p>
        </div>
      )}

      <div className="glass rounded-3xl border border-white/5 shadow-ai p-6">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="text-[10px] text-slate-500 uppercase font-bold block mb-1">Date</label>
            <input
              type="date"
              value={date}
              max={today}
              onChange={(e) => setDate(e.target.value)}
              className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-slate-200 outline-none focus:border-primary-500/50"
            />
          </div>
          {isManager && (
            <div>
              <label className="text-[10px] text-slate-500 uppercase font-bold block mb-1">Member</label>
              <select
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(Number(e.target.value))}
                className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-slate-200 outline-none focus:border-primary-500/50 min-w-[200px]"
              >
                <option value={user?.id ?? 0}>Myself</option>
                {members
                  .filter((m) => (m.user_id ?? m.id) !== user?.id)
                  .map((m) => (
                    <option key={m.user_id ?? m.id} value={m.user_id ?? m.id}>
                      {m.first_name} {m.last_name}
                    </option>
                  ))}
              </select>
            </div>
          )}
          <button
            onClick={generate}
            disabled={loading || aiEnabled === false}
            className="flex items-center gap-2 bg-primary-500 hover:bg-primary-600 disabled:opacity-50 text-white px-5 py-2.5 rounded-xl text-sm font-bold transition-all shadow-ai"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Wand2 size={16} />}
            Generate Standup
          </button>
        </div>
      </div>

      {isManager && (
        <div className="glass rounded-2xl border border-white/5 p-5">
          <div className="flex items-center gap-2 mb-3">
            <Radio size={16} className="text-emerald-400" />
            <h3 className="text-sm font-semibold text-white">Live presence</h3>
            <span className="text-[10px] text-slate-500">Who is tracking right now</span>
          </div>
          {presence.length === 0 ? (
            <p className="text-xs text-slate-500">No one is online with an active timer.</p>
          ) : (
            <ul className="flex flex-wrap gap-3">
              {presence.map((s) => (
                <li key={s.time_entry_id} className="flex items-center gap-2 rounded-xl bg-white/5 border border-white/5 px-3 py-2">
                  <Avatar name={s.user_name} size="sm" />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-white truncate">{s.user_name}</p>
                    <p className="text-[10px] text-slate-500 truncate">{s.project_name} · {s.elapsed}</p>
                  </div>
                  <span className={`w-2 h-2 rounded-full ${s.is_paused ? 'bg-amber-400' : 'bg-emerald-400 animate-pulse'}`} />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {error && <p className="text-rose-400 text-sm">{error}</p>}

      {loading && (
        <div className="flex items-center gap-2 text-slate-400 text-sm">
          <Loader2 size={16} className="animate-spin text-primary-400" /> Writing the standup…
        </div>
      )}

      {result && !loading && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="grid grid-cols-1 lg:grid-cols-3 gap-6"
        >
          <div className="lg:col-span-2 glass rounded-3xl border border-white/5 shadow-ai p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-white font-bold">{result.user.name}</h3>
                <p className="text-xs text-slate-500">{result.date}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={sendToSlack}
                  disabled={slackState === 'sending' || slackState === 'sent'}
                  className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg bg-[#4A154B] text-white hover:opacity-90 disabled:opacity-60 transition-all"
                >
                  {slackState === 'sending' ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : slackState === 'sent' ? (
                    <Check size={13} />
                  ) : (
                    <Slack size={13} />
                  )}
                  {slackState === 'sent' ? 'Sent' : 'Send to Slack'}
                </button>
                <span className="text-[10px] text-slate-500 uppercase font-bold bg-white/5 px-2 py-1 rounded-lg">
                  {result.model}
                </span>
              </div>
            </div>
            {slackNote && <p className="text-amber-400 text-xs mb-3">{slackNote}</p>}
            <Markdown text={result.standup} />
          </div>

          <div className="space-y-4">
            <div className="glass rounded-3xl border border-white/5 p-5">
              <div className="flex items-center gap-2 text-slate-400 text-xs uppercase font-bold mb-3">
                <Gauge size={14} /> Day at a glance
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-slate-400 text-sm"><Clock size={14} /> Tracked</span>
                  <span className="text-white font-mono font-bold">{trackedHours}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-slate-400 text-sm"><ListChecks size={14} /> Entries</span>
                  <span className="text-white font-mono font-bold">{result.stats.entries}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-slate-400 text-sm"><Gauge size={14} /> Productive</span>
                  <span className="text-emerald-400 font-mono font-bold">{result.stats.productive_percent}%</span>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
};

export default DailyStandupPage;
