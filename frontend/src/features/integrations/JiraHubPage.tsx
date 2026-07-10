import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Trello, Loader2, RefreshCw, Search, ChevronLeft, MessageSquare,
  ArrowRightLeft, Clock, Check, Send, Plus,
} from 'lucide-react';
import { jiraService, type JiraIssue, type JiraIssueDetail, type JiraTransition } from '../../api/jiraService';
import { projectService, type Project } from '../../api/projectService';
import { getApiErrorMessage } from '../../utils/apiError';
import ListPagination from '../../components/ListPagination';

const JQL_PRESETS = [
  { label: 'My issues', jql: 'assignee = currentUser() ORDER BY updated DESC' },
  { label: 'Open', jql: 'assignee = currentUser() AND statusCategory != Done ORDER BY updated DESC' },
  { label: 'Recently updated', jql: 'updated >= -7d ORDER BY updated DESC' },
];

const PER_PAGE = 25;

const JiraHubPage = () => {
  const [issues, setIssues] = useState<JiraIssue[]>([]);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [jql, setJql] = useState(JQL_PRESETS[0].jql);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const pageTokensRef = useRef<(string | null)[]>([null]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [detail, setDetail] = useState<JiraIssueDetail | null>(null);
  const [transitions, setTransitions] = useState<JiraTransition[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [comment, setComment] = useState('');
  const [commentBusy, setCommentBusy] = useState(false);
  const [transitionBusy, setTransitionBusy] = useState<string | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [logMinutes, setLogMinutes] = useState(30);
  const [logProjectId, setLogProjectId] = useState('');
  const [pushWorklog, setPushWorklog] = useState(true);
  const [logBusy, setLogBusy] = useState(false);
  const [logSuccess, setLogSuccess] = useState(false);

  const loadIssues = useCallback(async (targetPage = 1, keepSelection = false) => {
    setLoading(true);
    setError(null);
    try {
      const token = pageTokensRef.current[targetPage - 1] ?? null;
      const r = await jiraService.issues({ jql, page: targetPage, pageToken: token, perPage: PER_PAGE });
      setConnected(r.data.connected);
      setIssues(r.data.issues);
      setPage(targetPage);
      setHasMore(!!r.data.has_more);
      if (r.data.next_page_token) {
        pageTokensRef.current[targetPage] = r.data.next_page_token;
      }
      if (r.data.connected && r.data.issues.length > 0) {
        const stillVisible = keepSelection && selectedKey && r.data.issues.some((i) => i.key === selectedKey);
        if (!stillVisible) setSelectedKey(r.data.issues[0].key);
      } else if (targetPage === 1) {
        setSelectedKey(null);
      }
    } catch (e) {
      setError(getApiErrorMessage(e, 'Failed to load Jira issues'));
      setConnected(false);
    } finally {
      setLoading(false);
    }
  }, [jql, selectedKey]);

  const loadDetail = useCallback(async (key: string) => {
    setDetailLoading(true);
    setError(null);
    setLogSuccess(false);
    try {
      const [issueRes, transRes] = await Promise.all([
        jiraService.issue(key),
        jiraService.transitions(key),
      ]);
      setDetail(issueRes.data);
      setTransitions(transRes.data);
    } catch (e) {
      setError(getApiErrorMessage(e, 'Failed to load issue'));
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    pageTokensRef.current = [null];
    setPage(1);
    setSearch('');
    void loadIssues(1);
    projectService.getAll().then((r) => setProjects(r.data)).catch(() => undefined);
  }, [jql]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (selectedKey) void loadDetail(selectedKey);
  }, [selectedKey, loadDetail]);

  const filtered = issues.filter((i) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return i.key.toLowerCase().includes(q) || i.summary.toLowerCase().includes(q);
  });

  const runTransition = async (transitionId: string) => {
    if (!selectedKey) return;
    setTransitionBusy(transitionId);
    try {
      await jiraService.transition(selectedKey, transitionId);
      await loadDetail(selectedKey);
      await loadIssues(page, true);
    } catch (e) {
      setError(getApiErrorMessage(e, 'Transition failed'));
    } finally {
      setTransitionBusy(null);
    }
  };

  const postComment = async () => {
    if (!selectedKey || !comment.trim()) return;
    setCommentBusy(true);
    try {
      await jiraService.comment(selectedKey, comment.trim());
      setComment('');
      await loadDetail(selectedKey);
    } catch (e) {
      setError(getApiErrorMessage(e, 'Failed to post comment'));
    } finally {
      setCommentBusy(false);
    }
  };

  const logTime = async () => {
    if (!detail) return;
    setLogBusy(true);
    setLogSuccess(false);
    try {
      await jiraService.logTime({
        issue_key: detail.key,
        summary: detail.summary,
        url: detail.url,
        project: detail.project,
        project_id: logProjectId ? Number(logProjectId) : undefined,
        duration_minutes: logMinutes,
        push_worklog: pushWorklog,
      });
      setLogSuccess(true);
    } catch (e) {
      setError(getApiErrorMessage(e, 'Failed to log time'));
    } finally {
      setLogBusy(false);
    }
  };

  if (connected === false) {
    return (
      <div className="max-w-2xl mx-auto text-center py-16">
        <div className="h-14 w-14 rounded-2xl bg-[#0052CC] flex items-center justify-center text-white mx-auto mb-4">
          <Trello size={28} />
        </div>
        <h1 className="text-2xl font-bold text-white">Connect Jira first</h1>
        <p className="text-slate-400 mt-2 text-sm">
          Link your Jira site in Integrations, then manage issues here without opening Jira.
        </p>
        <Link to="/integrations" className="inline-block mt-6 px-5 py-2.5 rounded-xl bg-[#0052CC] text-white text-sm font-bold">
          Go to Integrations
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link to="/integrations" className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-white mb-2">
            <ChevronLeft size={14} /> Integrations
          </Link>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Trello size={24} className="text-[#0052CC]" /> Jira Workspace
          </h1>
        </div>
        <button
          onClick={() => void loadIssues(page, true)}
          disabled={loading}
          className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/5"
        >
          <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {error && <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-sm">{error}</div>}

      <div className="flex flex-wrap gap-2">
        {JQL_PRESETS.map((p) => (
          <button
            key={p.label}
            onClick={() => setJql(p.jql)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              jql === p.jql ? 'bg-[#0052CC] text-white' : 'bg-white/5 text-slate-400 hover:text-white'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,340px)_1fr] gap-4 lg:h-[calc(100vh-220px)] lg:min-h-[520px]">
        {/* Issue list */}
        <div className="glass rounded-2xl border border-white/5 overflow-hidden flex flex-col min-h-0 max-h-[70vh] lg:max-h-full lg:h-full">
          <div className="p-3 border-b border-white/5 shrink-0">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search issues…"
                className="w-full bg-white/5 border border-white/10 rounded-lg pl-9 pr-3 py-2 text-xs text-white outline-none focus:border-[#0052CC]/50"
              />
            </div>
          </div>
          <div className="overflow-y-auto flex-1 min-h-0">
            {loading ? (
              <div className="p-6 flex items-center gap-2 text-slate-400 text-sm">
                <Loader2 size={16} className="animate-spin" /> Loading…
              </div>
            ) : filtered.length === 0 ? (
              <p className="p-6 text-slate-500 text-sm">No issues found.</p>
            ) : (
              filtered.map((issue) => (
                <button
                  key={issue.key}
                  onClick={() => setSelectedKey(issue.key)}
                  className={`w-full text-left px-4 py-3 border-b border-white/5 transition-all ${
                    selectedKey === issue.key ? 'bg-[#0052CC]/15 border-l-2 border-l-[#0052CC]' : 'hover:bg-white/[0.03]'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-mono text-[#4C9AFF]">{issue.key}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-slate-400">{issue.status}</span>
                  </div>
                  <p className="text-sm text-white truncate mt-0.5">{issue.summary}</p>
                </button>
              ))
            )}
          </div>
          <ListPagination
            page={page}
            hasMore={hasMore}
            loading={loading}
            label="Issues page"
            onPrev={() => void loadIssues(page - 1, true)}
            onNext={() => void loadIssues(page + 1)}
          />
        </div>

        {/* Issue detail */}
        <div className="glass rounded-2xl border border-white/5 overflow-hidden flex flex-col min-h-0 max-h-[70vh] lg:max-h-full lg:h-full">
          {!selectedKey ? (
            <p className="p-8 text-slate-500 text-sm">Select an issue to view details.</p>
          ) : detailLoading || !detail ? (
            <div className="p-8 flex items-center gap-2 text-slate-400 text-sm">
              <Loader2 size={16} className="animate-spin" /> Loading issue…
            </div>
          ) : (
            <div className="flex flex-col h-full min-h-0">
              <div className="p-5 border-b border-white/5 space-y-2 shrink-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-mono text-[#4C9AFF]">{detail.key}</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/20">
                    {detail.status}
                  </span>
                  {detail.type && <span className="text-[10px] text-slate-500">{detail.type}</span>}
                </div>
                <h2 className="text-lg font-bold text-white">{detail.summary}</h2>
                {detail.description && (
                  <p className="text-sm text-slate-400 whitespace-pre-wrap line-clamp-4">{detail.description}</p>
                )}
                <div className="flex flex-wrap gap-3 text-[11px] text-slate-500">
                  {detail.assignee && <span>Assignee: {detail.assignee}</span>}
                  {detail.priority && <span>Priority: {detail.priority}</span>}
                  {detail.project && <span>Project: {detail.project}</span>}
                </div>
              </div>

              <div className="overflow-y-auto flex-1 min-h-0 p-5 space-y-5">
                {/* Transitions */}
                {transitions.length > 0 && (
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-1">
                      <ArrowRightLeft size={12} /> Move issue
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {transitions.map((t) => (
                        <button
                          key={t.id}
                          onClick={() => void runTransition(t.id)}
                          disabled={transitionBusy === t.id}
                          className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs text-white hover:bg-[#0052CC]/20 hover:border-[#0052CC]/40 disabled:opacity-50"
                        >
                          {transitionBusy === t.id ? <Loader2 size={12} className="animate-spin inline" /> : null}{' '}
                          {t.name} → {t.to_status}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Log time */}
                <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-1">
                    <Clock size={12} /> Log time in FlowTrack
                  </h3>
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={logProjectId}
                      onChange={(e) => setLogProjectId(e.target.value)}
                      className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-slate-300"
                    >
                      <option value="">No project</option>
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                    <select
                      value={logMinutes}
                      onChange={(e) => setLogMinutes(Number(e.target.value))}
                      className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-slate-300"
                    >
                      {[15, 30, 45, 60, 90, 120].map((m) => (
                        <option key={m} value={m}>{m} min</option>
                      ))}
                    </select>
                    <label className="flex items-center gap-1.5 text-xs text-slate-400">
                      <input type="checkbox" checked={pushWorklog} onChange={(e) => setPushWorklog(e.target.checked)} />
                      Push to Jira
                    </label>
                    <button
                      onClick={() => void logTime()}
                      disabled={logBusy}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#0052CC] text-white text-xs font-bold disabled:opacity-50"
                    >
                      {logBusy ? <Loader2 size={12} className="animate-spin" /> : logSuccess ? <Check size={12} /> : <Plus size={12} />}
                      {logSuccess ? 'Logged' : 'Log time'}
                    </button>
                  </div>
                </div>

                {/* Comments */}
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-1">
                    <MessageSquare size={12} /> Comments
                  </h3>
                  <div className="space-y-2 mb-3 max-h-48 overflow-y-auto">
                    {detail.comments.length === 0 ? (
                      <p className="text-xs text-slate-500">No comments yet.</p>
                    ) : (
                      detail.comments.map((c) => (
                        <div key={c.id} className="rounded-lg bg-white/[0.03] border border-white/5 p-3">
                          <p className="text-[11px] text-slate-500 mb-1">{c.author}</p>
                          <p className="text-sm text-slate-300 whitespace-pre-wrap">{c.body}</p>
                        </div>
                      ))
                    )}
                  </div>
                  <div className="flex gap-2">
                    <input
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      placeholder="Add a comment…"
                      className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-[#0052CC]/50"
                      onKeyDown={(e) => e.key === 'Enter' && void postComment()}
                    />
                    <button
                      onClick={() => void postComment()}
                      disabled={commentBusy || !comment.trim()}
                      className="px-3 py-2 rounded-lg bg-white/10 text-white disabled:opacity-50"
                    >
                      {commentBusy ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default JiraHubPage;
