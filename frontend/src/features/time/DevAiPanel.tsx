import { useEffect, useState } from 'react';
import {
  Sparkles, Github, GitCommit, GitPullRequest, Loader2, Plus, RefreshCw,
  Check, ExternalLink, Wand2, Trello,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { aiService, type AiSuggestion } from '../../api/aiService';
import { githubService, type GithubActivity } from '../../api/githubService';
import { jiraService, type JiraIssuesResult } from '../../api/jiraService';
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

const DevAiPanel = ({ projects, onLogged }: Props) => {
  const today = new Date().toISOString().split('T')[0];

  // AI suggestions state
  const [aiEnabled, setAiEnabled] = useState<boolean | null>(null);
  const [date, setDate] = useState(today);
  const [loadingSuggest, setLoadingSuggest] = useState(false);
  const [suggestions, setSuggestions] = useState<AiSuggestion[] | null>(null);
  const [suggestMsg, setSuggestMsg] = useState<string | null>(null);
  const [suggestError, setSuggestError] = useState<string | null>(null);
  const [addedIdx, setAddedIdx] = useState<Set<number>>(new Set());
  const [suggestProjects, setSuggestProjects] = useState<Record<number, string>>({});

  // GitHub state
  const [gh, setGh] = useState<GithubActivity | null>(null);
  const [ghLoading, setGhLoading] = useState(true);
  const [ghError, setGhError] = useState<string | null>(null);
  const [ghProjectId, setGhProjectId] = useState('');
  const [ghMinutes, setGhMinutes] = useState(30);
  const [ghLoggedKeys, setGhLoggedKeys] = useState<Set<string>>(new Set());
  const [ghBusyKey, setGhBusyKey] = useState<string | null>(null);

  // Jira state
  const [jira, setJira] = useState<JiraIssuesResult | null>(null);
  const [jiraLoading, setJiraLoading] = useState(true);
  const [jiraError, setJiraError] = useState<string | null>(null);
  const [jiraProjectId, setJiraProjectId] = useState('');
  const [jiraMinutes, setJiraMinutes] = useState(30);
  const [pushWorklog, setPushWorklog] = useState(true);
  const [jiraLoggedKeys, setJiraLoggedKeys] = useState<Set<string>>(new Set());
  const [jiraBusyKey, setJiraBusyKey] = useState<string | null>(null);

  useEffect(() => {
    aiService.status().then((r) => setAiEnabled(!!r.data.enabled)).catch(() => setAiEnabled(false));
    loadGithub();
    loadJira();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadJira = async () => {
    setJiraLoading(true);
    setJiraError(null);
    try {
      const r = await jiraService.issues();
      setJira(r.data);
    } catch (e) {
      setJiraError(getApiErrorMessage(e, 'Failed to load Jira issues'));
      setJira(null);
    } finally {
      setJiraLoading(false);
    }
  };

  const logJira = async (key: string, issue: { key: string; summary: string; url: string; project: string }) => {
    setJiraBusyKey(key);
    try {
      await jiraService.logTime({
        issue_key: issue.key,
        summary: issue.summary,
        url: issue.url,
        project: issue.project,
        project_id: jiraProjectId ? Number(jiraProjectId) : undefined,
        duration_minutes: jiraMinutes,
        push_worklog: pushWorklog,
      });
      setJiraLoggedKeys((prev) => new Set(prev).add(key));
      onLogged();
    } catch (e) {
      setJiraError(getApiErrorMessage(e, 'Failed to log time'));
    } finally {
      setJiraBusyKey(null);
    }
  };

  const loadGithub = async () => {
    setGhLoading(true);
    setGhError(null);
    try {
      const r = await githubService.activity(7);
      setGh(r.data);
    } catch (e) {
      setGhError(getApiErrorMessage(e, 'Failed to load GitHub activity'));
      setGh(null);
    } finally {
      setGhLoading(false);
    }
  };

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

  const logGh = async (
    key: string,
    payload: Parameters<typeof githubService.logTime>[0],
  ) => {
    setGhBusyKey(key);
    try {
      await githubService.logTime({
        ...payload,
        project_id: ghProjectId ? Number(ghProjectId) : undefined,
        duration_minutes: ghMinutes,
      });
      setGhLoggedKeys((prev) => new Set(prev).add(key));
      onLogged();
    } catch (e) {
      setGhError(getApiErrorMessage(e, 'Failed to log time'));
    } finally {
      setGhBusyKey(null);
    }
  };

  const showAi = aiEnabled !== false;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
      {/* AI Autopilot — full-day reconstruction */}
      {showAi && <AutopilotPanel projects={projects} onLogged={onLogged} />}

      {/* AI Suggestions */}
      {showAi && (
        <div className="glass rounded-3xl border border-white/5 shadow-ai overflow-hidden">
          <div className="p-6 border-b border-white/5 bg-white/[0.02] flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-primary-500/10 flex items-center justify-center text-primary-400">
                <Sparkles size={20} />
              </div>
              <div>
                <h3 className="font-bold text-white text-sm uppercase tracking-wider">AI Time Suggestions</h3>
                <p className="text-xs text-slate-500">Turn your tracked activity into time entries.</p>
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
                onClick={runSuggest}
                disabled={loadingSuggest}
                className="flex items-center gap-2 bg-primary-500 hover:bg-primary-600 disabled:opacity-60 text-white px-4 py-2 rounded-xl text-xs font-bold transition-all"
              >
                {loadingSuggest ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
                Suggest
              </button>
            </div>
          </div>

          <div className="p-6 space-y-3 min-h-[120px]">
            {suggestError && <p className="text-rose-400 text-sm">{suggestError}</p>}
            {!suggestions && !loadingSuggest && !suggestError && (
              <p className="text-slate-500 text-sm">
                Pick a day and let AI group your apps, tabs and commits into ready-to-log entries.
              </p>
            )}
            {loadingSuggest && (
              <div className="flex items-center gap-2 text-slate-400 text-sm">
                <Loader2 size={16} className="animate-spin" /> Analyzing your activity…
              </div>
            )}
            {suggestMsg && <p className="text-slate-500 text-sm">{suggestMsg}</p>}

            {suggestions?.map((s, idx) => (
              <div
                key={idx}
                className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 flex flex-col gap-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-white font-semibold text-sm truncate">{s.description}</p>
                    {s.rationale && <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{s.rationale}</p>}
                  </div>
                  <span className={`shrink-0 text-[10px] font-bold px-2 py-1 rounded-lg border ${confidenceStyle(s.confidence)}`}>
                    {Math.round(s.confidence * 100)}%
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-mono text-primary-300 bg-primary-500/10 px-2 py-1 rounded-lg">
                    {Math.floor(s.duration_minutes / 60) > 0 ? `${Math.floor(s.duration_minutes / 60)}h ` : ''}
                    {s.duration_minutes % 60}m
                  </span>
                  <select
                    value={suggestProjects[idx] ?? ''}
                    onChange={(e) => setSuggestProjects((p) => ({ ...p, [idx]: e.target.value }))}
                    className="flex-1 min-w-[140px] bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-slate-300 outline-none focus:border-primary-500/50"
                  >
                    <option value="">No project</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                  {addedIdx.has(idx) ? (
                    <span className="flex items-center gap-1 text-emerald-400 text-xs font-bold px-3">
                      <Check size={14} /> Added
                    </span>
                  ) : (
                    <button
                      onClick={() => addSuggestion(s, idx)}
                      className="flex items-center gap-1 bg-white/5 hover:bg-white/10 border border-white/10 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
                    >
                      <Plus size={14} /> Add
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* GitHub developer activity */}
      <div className={`glass rounded-3xl border border-white/5 shadow-ai overflow-hidden ${showAi ? '' : 'xl:col-span-2'}`}>
        <div className="p-6 border-b border-white/5 bg-white/[0.02] flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-white/5 flex items-center justify-center text-white">
              <Github size={20} />
            </div>
            <div>
              <h3 className="font-bold text-white text-sm uppercase tracking-wider">GitHub Activity</h3>
              <p className="text-xs text-slate-500">
                {gh?.login ? `@${gh.login} · last 7 days` : 'Link commits & PRs to time.'}
              </p>
            </div>
          </div>
          <button
            onClick={loadGithub}
            disabled={ghLoading}
            className="p-2 text-slate-500 hover:text-white hover:bg-white/5 rounded-lg transition-all"
            title="Refresh"
          >
            <RefreshCw size={16} className={ghLoading ? 'animate-spin' : ''} />
          </button>
        </div>

        <div className="p-6 space-y-3 min-h-[120px]">
          {ghError && <p className="text-rose-400 text-sm">{ghError}</p>}

          {ghLoading ? (
            <div className="flex items-center gap-2 text-slate-400 text-sm">
              <Loader2 size={16} className="animate-spin" /> Loading GitHub…
            </div>
          ) : gh && !gh.connected ? (
            <div className="text-sm text-slate-400">
              GitHub isn't connected yet.{' '}
              <Link to="/settings?tab=integrations" className="text-primary-400 font-bold hover:underline">
                Connect it in Settings → Integrations
              </Link>{' '}
              to log time straight from your commits.
            </div>
          ) : gh && (gh.commits.length > 0 || gh.pull_requests.length > 0) ? (
            <>
              <div className="flex flex-wrap items-center gap-2 pb-1">
                <span className="text-[10px] text-slate-500 uppercase font-bold">Log as</span>
                <select
                  value={ghProjectId}
                  onChange={(e) => setGhProjectId(e.target.value)}
                  className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-slate-300 outline-none focus:border-primary-500/50"
                >
                  <option value="">No project</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                <select
                  value={ghMinutes}
                  onChange={(e) => setGhMinutes(Number(e.target.value))}
                  className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-slate-300 outline-none focus:border-primary-500/50"
                >
                  {[15, 30, 45, 60, 90, 120].map((m) => (
                    <option key={m} value={m}>{m} min</option>
                  ))}
                </select>
              </div>

              {gh.commits.map((c) => {
                const key = `c:${c.repo}:${c.sha}`;
                return (
                  <div key={key} className="rounded-2xl border border-white/10 bg-white/[0.02] p-3 flex items-center gap-3">
                    <GitCommit size={16} className="text-emerald-400 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-white text-sm truncate">{c.message}</p>
                      <p className="text-[11px] text-slate-500 truncate">
                        {c.repo} · {c.short_sha}
                        {c.url && (
                          <a href={c.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 ml-2 text-slate-400 hover:text-primary-400">
                            <ExternalLink size={11} />
                          </a>
                        )}
                      </p>
                    </div>
                    {ghLoggedKeys.has(key) ? (
                      <span className="flex items-center gap-1 text-emerald-400 text-xs font-bold"><Check size={14} /> Logged</span>
                    ) : (
                      <button
                        onClick={() => logGh(key, { type: 'commit', repo: c.repo, external_id: c.sha, title: c.message, url: c.url, authored_at: c.authored_at })}
                        disabled={ghBusyKey === key}
                        className="flex items-center gap-1 bg-white/5 hover:bg-white/10 border border-white/10 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0"
                      >
                        {ghBusyKey === key ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} Log
                      </button>
                    )}
                  </div>
                );
              })}

              {gh.pull_requests.map((pr) => {
                const key = `pr:${pr.repo}:${pr.number}`;
                return (
                  <div key={key} className="rounded-2xl border border-white/10 bg-white/[0.02] p-3 flex items-center gap-3">
                    <GitPullRequest size={16} className={`shrink-0 ${pr.merged ? 'text-purple-400' : 'text-sky-400'}`} />
                    <div className="min-w-0 flex-1">
                      <p className="text-white text-sm truncate">{pr.title}</p>
                      <p className="text-[11px] text-slate-500 truncate">
                        {pr.repo} · #{pr.number} · {pr.merged ? 'merged' : pr.state}
                        {pr.url && (
                          <a href={pr.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 ml-2 text-slate-400 hover:text-primary-400">
                            <ExternalLink size={11} />
                          </a>
                        )}
                      </p>
                    </div>
                    {ghLoggedKeys.has(key) ? (
                      <span className="flex items-center gap-1 text-emerald-400 text-xs font-bold"><Check size={14} /> Logged</span>
                    ) : (
                      <button
                        onClick={() => logGh(key, { type: 'pull_request', repo: pr.repo, external_id: String(pr.number), title: pr.title, url: pr.url, authored_at: pr.updated_at })}
                        disabled={ghBusyKey === key}
                        className="flex items-center gap-1 bg-white/5 hover:bg-white/10 border border-white/10 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0"
                      >
                        {ghBusyKey === key ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} Log
                      </button>
                    )}
                  </div>
                );
              })}
            </>
          ) : (
            <p className="text-slate-500 text-sm">No recent commits or pull requests found.</p>
          )}
        </div>
      </div>

      {/* Jira issues */}
      <div className="glass rounded-3xl border border-white/5 shadow-ai overflow-hidden">
        <div className="p-6 border-b border-white/5 bg-white/[0.02] flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-[#0052CC] flex items-center justify-center text-white">
              <Trello size={20} />
            </div>
            <div>
              <h3 className="font-bold text-white text-sm uppercase tracking-wider">Jira Issues</h3>
              <p className="text-xs text-slate-500">Log time against your assigned issues.</p>
            </div>
          </div>
          <button
            onClick={loadJira}
            disabled={jiraLoading}
            className="p-2 text-slate-500 hover:text-white hover:bg-white/5 rounded-lg transition-all"
            title="Refresh"
          >
            <RefreshCw size={16} className={jiraLoading ? 'animate-spin' : ''} />
          </button>
        </div>

        <div className="p-6 space-y-3 min-h-[120px]">
          {jiraError && <p className="text-rose-400 text-sm">{jiraError}</p>}

          {jiraLoading ? (
            <div className="flex items-center gap-2 text-slate-400 text-sm">
              <Loader2 size={16} className="animate-spin" /> Loading Jira…
            </div>
          ) : jira && !jira.connected ? (
            <div className="text-sm text-slate-400">
              Jira isn't connected yet.{' '}
              <Link to="/settings?tab=integrations" className="text-primary-400 font-bold hover:underline">
                Connect it in Settings → Integrations
              </Link>{' '}
              to log time against your issues.
            </div>
          ) : jira && jira.issues.length > 0 ? (
            <>
              <div className="flex flex-wrap items-center gap-2 pb-1">
                <span className="text-[10px] text-slate-500 uppercase font-bold">Log as</span>
                <select
                  value={jiraProjectId}
                  onChange={(e) => setJiraProjectId(e.target.value)}
                  className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-slate-300 outline-none focus:border-primary-500/50"
                >
                  <option value="">No project</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                <select
                  value={jiraMinutes}
                  onChange={(e) => setJiraMinutes(Number(e.target.value))}
                  className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-slate-300 outline-none focus:border-primary-500/50"
                >
                  {[15, 30, 45, 60, 90, 120].map((m) => (
                    <option key={m} value={m}>{m} min</option>
                  ))}
                </select>
                <label className="flex items-center gap-1.5 text-xs text-slate-400 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={pushWorklog}
                    onChange={(e) => setPushWorklog(e.target.checked)}
                    className="rounded border-white/20"
                  />
                  Push worklog to Jira
                </label>
              </div>

              {jira.issues.map((issue) => {
                const key = `j:${issue.key}`;
                return (
                  <div key={key} className="rounded-2xl border border-white/10 bg-white/[0.02] p-3 flex items-center gap-3">
                    <Trello size={16} className="text-sky-400 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-white text-sm truncate">{issue.summary || issue.key}</p>
                      <p className="text-[11px] text-slate-500 truncate">
                        {issue.key} · {issue.status}{issue.project ? ` · ${issue.project}` : ''}
                        {issue.url && (
                          <a href={issue.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 ml-2 text-slate-400 hover:text-primary-400">
                            <ExternalLink size={11} />
                          </a>
                        )}
                      </p>
                    </div>
                    {jiraLoggedKeys.has(key) ? (
                      <span className="flex items-center gap-1 text-emerald-400 text-xs font-bold"><Check size={14} /> Logged</span>
                    ) : (
                      <button
                        onClick={() => logJira(key, issue)}
                        disabled={jiraBusyKey === key}
                        className="flex items-center gap-1 bg-white/5 hover:bg-white/10 border border-white/10 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0"
                      >
                        {jiraBusyKey === key ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} Log
                      </button>
                    )}
                  </div>
                );
              })}
            </>
          ) : (
            <p className="text-slate-500 text-sm">No assigned Jira issues found.</p>
          )}
        </div>
      </div>

      {/* Calendar meetings → time */}
      <CalendarPanel projects={projects} onLogged={onLogged} />
    </div>
  );
};

export default DevAiPanel;
