import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Github, Loader2, RefreshCw, ChevronLeft, GitCommit, GitPullRequest,
  MessageSquare, GitMerge, XCircle, Check, Send, Clock,
} from 'lucide-react';
import {
  githubService,
  type GithubActivity,
  type GithubPullRequest,
  type GithubPullRequestDetail,
  type GithubPagination,
} from '../../api/githubService';
import { projectService, type Project } from '../../api/projectService';
import { getApiErrorMessage } from '../../utils/apiError';
import ListPagination from '../../components/ListPagination';

function parseRepo(repo: string): { owner: string; name: string } | null {
  const parts = repo.split('/');
  if (parts.length !== 2) return null;
  return { owner: parts[0], name: parts[1] };
}

const GitHubHubPage = () => {
  const [activity, setActivity] = useState<GithubActivity | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPr, setSelectedPr] = useState<GithubPullRequest | null>(null);
  const [detail, setDetail] = useState<GithubPullRequestDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [comment, setComment] = useState('');
  const [commentBusy, setCommentBusy] = useState(false);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [logMinutes, setLogMinutes] = useState(30);
  const [logProjectId, setLogProjectId] = useState('');
  const [logSuccess, setLogSuccess] = useState(false);
  const [prPage, setPrPage] = useState(1);
  const [commitPage, setCommitPage] = useState(1);
  const [prPagination, setPrPagination] = useState<GithubPagination | null>(null);
  const [commitPagination, setCommitPagination] = useState<GithubPagination | null>(null);

  const loadActivity = useCallback(async (nextPrPage = prPage, nextCommitPage = commitPage) => {
    setLoading(true);
    setError(null);
    try {
      const r = await githubService.activity({
        days: 14,
        prPage: nextPrPage,
        commitPage: nextCommitPage,
        perPage: 20,
      });
      setActivity(r.data);
      setPrPage(nextPrPage);
      setCommitPage(nextCommitPage);
      setPrPagination(r.data.pull_requests_pagination ?? null);
      setCommitPagination(r.data.commits_pagination ?? null);
    } catch (e) {
      setError(getApiErrorMessage(e, 'Failed to load GitHub activity'));
      setActivity(null);
    } finally {
      setLoading(false);
    }
  }, [prPage, commitPage]);

  const loadDetail = useCallback(async (pr: GithubPullRequest) => {
    const parsed = parseRepo(pr.repo);
    if (!parsed) return;
    setDetailLoading(true);
    setError(null);
    setLogSuccess(false);
    try {
      const r = await githubService.pullRequest(parsed.owner, parsed.name, pr.number);
      setDetail(r.data);
    } catch (e) {
      setError(getApiErrorMessage(e, 'Failed to load pull request'));
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadActivity();
    projectService.getAll().then((r) => setProjects(r.data)).catch(() => undefined);
  }, [loadActivity]);

  useEffect(() => {
    if (selectedPr) void loadDetail(selectedPr);
  }, [selectedPr, loadDetail]);

  const postComment = async () => {
    if (!selectedPr || !comment.trim()) return;
    const parsed = parseRepo(selectedPr.repo);
    if (!parsed) return;
    setCommentBusy(true);
    try {
      await githubService.commentPull(parsed.owner, parsed.name, selectedPr.number, comment.trim());
      setComment('');
      await loadDetail(selectedPr);
    } catch (e) {
      setError(getApiErrorMessage(e, 'Failed to post comment'));
    } finally {
      setCommentBusy(false);
    }
  };

  const mergePr = async () => {
    if (!selectedPr) return;
    const parsed = parseRepo(selectedPr.repo);
    if (!parsed) return;
    setActionBusy('merge');
    try {
      await githubService.mergePull(parsed.owner, parsed.name, selectedPr.number);
      await loadDetail(selectedPr);
      await loadActivity(prPage, commitPage);
    } catch (e) {
      setError(getApiErrorMessage(e, 'Merge failed'));
    } finally {
      setActionBusy(null);
    }
  };

  const closePr = async () => {
    if (!selectedPr) return;
    const parsed = parseRepo(selectedPr.repo);
    if (!parsed) return;
    setActionBusy('close');
    try {
      await githubService.updatePullState(parsed.owner, parsed.name, selectedPr.number, 'closed');
      await loadDetail(selectedPr);
      await loadActivity(prPage, commitPage);
    } catch (e) {
      setError(getApiErrorMessage(e, 'Failed to close PR'));
    } finally {
      setActionBusy(null);
    }
  };

  const logTime = async (item: { type: 'commit' | 'pull_request'; repo: string; external_id: string; title: string; url: string; authored_at: string | null }) => {
    setActionBusy(`log:${item.external_id}`);
    setLogSuccess(false);
    try {
      await githubService.logTime({
        type: item.type,
        repo: item.repo,
        external_id: item.external_id,
        title: item.title,
        url: item.url,
        authored_at: item.authored_at,
        project_id: logProjectId ? Number(logProjectId) : undefined,
        duration_minutes: logMinutes,
      });
      setLogSuccess(true);
    } catch (e) {
      setError(getApiErrorMessage(e, 'Failed to log time'));
    } finally {
      setActionBusy(null);
    }
  };

  if (!loading && activity && !activity.connected) {
    return (
      <div className="max-w-2xl mx-auto text-center py-16">
        <div className="h-14 w-14 rounded-2xl bg-[#24292f] flex items-center justify-center text-white mx-auto mb-4">
          <Github size={28} />
        </div>
        <h1 className="text-2xl font-bold text-white">Connect GitHub first</h1>
        <p className="text-slate-400 mt-2 text-sm">
          Link GitHub in Integrations, then review PRs and log time without leaving FlowTrack.
        </p>
        <Link to="/integrations" className="inline-block mt-6 px-5 py-2.5 rounded-xl bg-[#24292f] text-white text-sm font-bold">
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
            <Github size={24} /> GitHub Workspace
            {activity?.login && <span className="text-sm font-normal text-slate-500">@{activity.login}</span>}
          </h1>
        </div>
        <button
          onClick={() => void loadActivity(prPage, commitPage)}
          disabled={loading}
          className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/5"
        >
          <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {error && <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-sm">{error}</div>}

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-white/[0.02] p-3">
        <span className="text-[10px] uppercase font-bold text-slate-500">Log as</span>
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
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,360px)_1fr] gap-4 lg:h-[calc(100vh-220px)] lg:min-h-[520px]">
        {/* Activity list */}
        <div className="glass rounded-2xl border border-white/5 overflow-hidden flex flex-col min-h-0 max-h-[70vh] lg:max-h-full lg:h-full">
          <div className="p-3 border-b border-white/5 text-xs font-bold uppercase tracking-wider text-slate-500 shrink-0">
            Recent activity
          </div>
          <div className="overflow-y-auto flex-1 min-h-0">
            {loading ? (
              <div className="p-6 flex items-center gap-2 text-slate-400 text-sm">
                <Loader2 size={16} className="animate-spin" /> Loading…
              </div>
            ) : (
              <>
                {(activity?.pull_requests.length ?? 0) > 0 && (
                  <div className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 border-b border-white/5">
                    Pull requests
                  </div>
                )}
                {activity?.pull_requests.map((pr) => {
                  const key = `pr:${pr.repo}:${pr.number}`;
                  const active = selectedPr?.repo === pr.repo && selectedPr?.number === pr.number;
                  return (
                    <button
                      key={key}
                      onClick={() => setSelectedPr(pr)}
                      className={`w-full text-left px-4 py-3 border-b border-white/5 flex items-start gap-2 ${
                        active ? 'bg-white/10 border-l-2 border-l-sky-400' : 'hover:bg-white/[0.03]'
                      }`}
                    >
                      <GitPullRequest size={14} className={`shrink-0 mt-0.5 ${pr.merged ? 'text-purple-400' : 'text-sky-400'}`} />
                      <div className="min-w-0">
                        <p className="text-sm text-white truncate">{pr.title}</p>
                        <p className="text-[11px] text-slate-500">{pr.repo} · #{pr.number}</p>
                      </div>
                    </button>
                  );
                })}
                {prPagination && (prPagination.total_pages > 1 || prPagination.page > 1) && (
                  <ListPagination
                    page={prPagination.page}
                    totalPages={prPagination.total_pages}
                    total={prPagination.total}
                    hasMore={prPagination.has_more}
                    loading={loading}
                    label="PRs"
                    onPrev={() => void loadActivity(prPage - 1, commitPage)}
                    onNext={() => void loadActivity(prPage + 1, commitPage)}
                  />
                )}
                {(activity?.commits.length ?? 0) > 0 && (
                  <div className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 border-b border-white/5 border-t border-white/5">
                    Commits
                  </div>
                )}
                {activity?.commits.map((c) => {
                  const key = `c:${c.repo}:${c.sha}`;
                  return (
                    <div key={key} className="px-4 py-3 border-b border-white/5 flex items-center gap-2">
                      <GitCommit size={14} className="text-emerald-400 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-white truncate">{c.message}</p>
                        <p className="text-[11px] text-slate-500">{c.repo} · {c.short_sha}</p>
                      </div>
                      <button
                        onClick={() => void logTime({
                          type: 'commit',
                          repo: c.repo,
                          external_id: c.sha,
                          title: c.message,
                          url: c.url,
                          authored_at: c.authored_at,
                        })}
                        disabled={actionBusy === `log:${c.sha}`}
                        className="shrink-0 px-2 py-1 rounded-lg bg-white/5 text-[10px] font-bold text-white"
                      >
                        {actionBusy === `log:${c.sha}` ? <Loader2 size={12} className="animate-spin" /> : 'Log'}
                      </button>
                    </div>
                  );
                })}
                {commitPagination && (commitPagination.total_pages > 1 || commitPagination.page > 1) && (
                  <ListPagination
                    page={commitPagination.page}
                    totalPages={commitPagination.total_pages}
                    total={commitPagination.total}
                    hasMore={commitPagination.has_more}
                    loading={loading}
                    label="Commits"
                    onPrev={() => void loadActivity(prPage, commitPage - 1)}
                    onNext={() => void loadActivity(prPage, commitPage + 1)}
                  />
                )}
              </>
            )}
          </div>
        </div>

        {/* PR detail */}
        <div className="glass rounded-2xl border border-white/5 overflow-hidden">
          {!selectedPr ? (
            <div className="p-8 text-center text-slate-500 text-sm">
              Select a pull request to review, comment, merge, or close — all in FlowTrack.
            </div>
          ) : detailLoading || !detail ? (
            <div className="p-8 flex items-center gap-2 text-slate-400 text-sm">
              <Loader2 size={16} className="animate-spin" /> Loading PR…
            </div>
          ) : (
            <div className="flex flex-col max-h-[70vh] lg:max-h-[calc(100vh-220px)]">
              <div className="p-5 border-b border-white/5 shrink-0">
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-300 border border-sky-500/20">
                    {detail.merged ? 'merged' : detail.state}
                  </span>
                  <span className="text-[11px] text-slate-500">{detail.repo} · #{detail.number}</span>
                </div>
                <h2 className="text-lg font-bold text-white">{detail.title}</h2>
                <p className="text-[11px] text-slate-500 mt-1">
                  {detail.head} → {detail.base} · by {detail.user}
                </p>
                {detail.body && (
                  <p className="text-sm text-slate-400 mt-3 whitespace-pre-wrap line-clamp-4">{detail.body}</p>
                )}

                <div className="flex flex-wrap gap-2 mt-4">
                  {!detail.merged && detail.state === 'open' && (
                    <>
                      <button
                        onClick={() => void mergePr()}
                        disabled={actionBusy === 'merge' || detail.mergeable === false}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold disabled:opacity-50"
                      >
                        {actionBusy === 'merge' ? <Loader2 size={12} className="animate-spin" /> : <GitMerge size={12} />}
                        Merge
                      </button>
                      <button
                        onClick={() => void closePr()}
                        disabled={actionBusy === 'close'}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs text-white disabled:opacity-50"
                      >
                        {actionBusy === 'close' ? <Loader2 size={12} className="animate-spin" /> : <XCircle size={12} />}
                        Close
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => {
                      const parsed = parseRepo(selectedPr.repo);
                      if (!parsed) return;
                      void logTime({
                        type: 'pull_request',
                        repo: selectedPr.repo,
                        external_id: String(selectedPr.number),
                        title: selectedPr.title,
                        url: selectedPr.url,
                        authored_at: selectedPr.updated_at,
                      });
                    }}
                    disabled={!!actionBusy?.startsWith('log:')}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white/10 text-xs text-white font-bold"
                  >
                    {logSuccess ? <Check size={12} /> : <Clock size={12} />} Log {logMinutes}m
                  </button>
                </div>
              </div>

              <div className="overflow-y-auto flex-1 p-5 space-y-4">
                {detail.reviews.length > 0 && (
                  <div>
                    <h3 className="text-xs font-bold uppercase text-slate-500 mb-2">Reviews</h3>
                    {detail.reviews.map((r) => (
                      <div key={r.id} className="rounded-lg bg-white/[0.03] border border-white/5 p-3 mb-2">
                        <p className="text-[11px] text-slate-500">{r.author} · {r.state}</p>
                        {r.body && <p className="text-sm text-slate-300 mt-1">{r.body}</p>}
                      </div>
                    ))}
                  </div>
                )}

                <div>
                  <h3 className="text-xs font-bold uppercase text-slate-500 mb-2 flex items-center gap-1">
                    <MessageSquare size={12} /> Comments
                  </h3>
                  <div className="space-y-2 mb-3 max-h-40 overflow-y-auto">
                    {detail.comments.length === 0 ? (
                      <p className="text-xs text-slate-500">No comments yet.</p>
                    ) : (
                      detail.comments.map((c) => (
                        <div key={c.id} className="rounded-lg bg-white/[0.03] border border-white/5 p-3">
                          <p className="text-[11px] text-slate-500">{c.author}</p>
                          <p className="text-sm text-slate-300 whitespace-pre-wrap">{c.body}</p>
                        </div>
                      ))
                    )}
                  </div>
                  {!detail.merged && (
                    <div className="flex gap-2">
                      <input
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                        placeholder="Leave a comment…"
                        className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none"
                        onKeyDown={(e) => e.key === 'Enter' && void postComment()}
                      />
                      <button
                        onClick={() => void postComment()}
                        disabled={commentBusy || !comment.trim()}
                        className="px-3 py-2 rounded-lg bg-[#24292f] text-white disabled:opacity-50"
                      >
                        {commentBusy ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default GitHubHubPage;
