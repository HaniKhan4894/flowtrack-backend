import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Sparkles, Send, Loader2, Wand2 } from 'lucide-react';
import { aiService } from '../../api/aiService';
import { getApiErrorMessage } from '../../utils/apiError';

const SUGGESTIONS = [
  'Summarize how the team performed this week.',
  'Who were the top contributors and what pulled focus away?',
  'Which projects consumed the most hours in the last 30 days?',
  'Is productivity trending up or down, and why?',
];

const AskFlowTrack = () => {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    aiService
      .status()
      .then((r) => setAvailable(r.data.enabled))
      .catch(() => setAvailable(false));
  }, []);

  const submit = async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed || loading) return;
    setLoading(true);
    setError(null);
    setAnswer(null);
    try {
      const res = await aiService.ask(trimmed);
      setAnswer(res.data.answer);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Could not get an answer. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  if (available === false) {
    return null;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-violet-500/30 bg-gradient-to-br from-violet-600/10 via-fuchsia-500/5 to-transparent p-5"
    >
      <div className="flex items-center gap-2 mb-3">
        <div className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-ai-gradient shadow-ai">
          <Sparkles className="w-5 h-5 text-white" />
        </div>
        <div>
          <h2 className="text-white font-semibold leading-tight">Ask FlowTrack</h2>
          <p className="text-xs text-slate-400">Natural-language answers grounded in your team's real data.</p>
        </div>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit(question);
        }}
        className="flex items-center gap-2"
      >
        <input
          ref={inputRef}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="e.g. How did the team do this week?"
          className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-violet-400/60"
          maxLength={500}
          disabled={available === null}
        />
        <button
          type="submit"
          disabled={loading || available === null || !question.trim()}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-violet-600 text-white text-sm font-medium hover:bg-violet-500 disabled:opacity-50 transition"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          Ask
        </button>
      </form>

      {!answer && !loading && (
        <div className="flex flex-wrap gap-2 mt-3">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                setQuestion(s);
                void submit(s);
              }}
              className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full bg-white/5 text-slate-300 hover:bg-white/10 border border-white/10 transition"
            >
              <Wand2 className="w-3 h-3 text-violet-400" />
              {s}
            </button>
          ))}
        </div>
      )}

      {error && <p className="text-red-400 text-sm mt-3">{error}</p>}

      {loading && (
        <div className="flex items-center gap-2 text-slate-400 text-sm mt-4">
          <Loader2 className="w-4 h-4 animate-spin text-violet-400" />
          Analyzing your team's data…
        </div>
      )}

      {answer && !loading && (
        <div className="mt-4 rounded-xl bg-white/5 border border-white/10 p-4">
          <p className="text-slate-200 text-sm whitespace-pre-wrap leading-relaxed">{answer}</p>
        </div>
      )}
    </motion.div>
  );
};

export default AskFlowTrack;
