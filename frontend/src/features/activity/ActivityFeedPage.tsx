import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Activity, Bell, Github, MessageSquare, Plug, Trello, CalendarDays, Sparkles, RefreshCw, ExternalLink,
} from 'lucide-react';
import { notificationService } from '../../api/notificationService';
import { integrationsService, type Integration } from '../../api/integrationsService';
import { githubService } from '../../api/githubService';
import { jiraService } from '../../api/jiraService';
import { slackService } from '../../api/slackService';
import { calendarService } from '../../api/calendarService';
import { PageSkeleton, EmptyState, Card, Badge, Avatar, Tabs, Button } from '../../components/ui';
import { useAuthStore } from '../../store/authStore';
import { cn } from '../../lib/cn';

type FeedFilter = 'all' | 'notifications' | 'jira' | 'github' | 'slack' | 'calendar';

type FeedSource = 'notification' | 'jira' | 'github' | 'slack' | 'calendar';

type FeedItem = {
  id: string;
  source: FeedSource;
  title: string;
  body?: string;
  at?: string | null;
  href?: string;
  externalUrl?: string | null;
  meta?: string;
};

const sourceMeta: Record<FeedSource, { label: string; icon: typeof Bell; color: string }> = {
  notification: { label: 'FlowTrack', icon: Bell, color: 'text-primary-400' },
  jira: { label: 'Jira', icon: Trello, color: 'text-sky-400' },
  github: { label: 'GitHub', icon: Github, color: 'text-slate-200' },
  slack: { label: 'Slack', icon: MessageSquare, color: 'text-pink-400' },
  calendar: { label: 'Calendar', icon: CalendarDays, color: 'text-emerald-400' },
};

function isConnected(list: Integration[] | undefined, provider: string) {
  return (list ?? []).some(
    (i) => i.provider === provider && (i.connected || i.is_enabled),
  );
}

function parseTime(value?: string | null): number {
  if (!value) return 0;
  const t = Date.parse(value);
  return Number.isFinite(t) ? t : 0;
}

export default function ActivityFeedPage() {
  const user = useAuthStore((s) => s.user);
  const [filter, setFilter] = useState<FeedFilter>('all');

  const integrationsQuery = useQuery({
    queryKey: ['activity-feed', 'integrations'],
    queryFn: () => integrationsService.list().then((r) => r.data ?? []),
    staleTime: 60_000,
  });

  const integrations = integrationsQuery.data;
  const githubOn = isConnected(integrations, 'github');
  const jiraOn = isConnected(integrations, 'jira');
  const slackOn = isConnected(integrations, 'slack');
  const calendarOn =
    isConnected(integrations, 'google_calendar') ||
    isConnected(integrations, 'microsoft');

  const notifQuery = useQuery({
    queryKey: ['activity-feed', 'notifications'],
    queryFn: () => notificationService.list().then((r) => r.data ?? []),
    refetchInterval: 60_000,
  });

  const githubQuery = useQuery({
    queryKey: ['activity-feed', 'github'],
    queryFn: () => githubService.activity({ days: 14, perPage: 15 }).then((r) => r.data),
    enabled: githubOn,
    staleTime: 60_000,
    retry: false,
  });

  const jiraQuery = useQuery({
    queryKey: ['activity-feed', 'jira'],
    queryFn: () =>
      jiraService
        .issues({
          jql: 'assignee = currentUser() ORDER BY updated DESC',
          perPage: 15,
        })
        .then((r) => r.data),
    enabled: jiraOn,
    staleTime: 60_000,
    retry: false,
  });

  const slackMetaQuery = useQuery({
    queryKey: ['activity-feed', 'slack-meta'],
    queryFn: () => slackService.meta().then((r) => r.data),
    enabled: slackOn,
    staleTime: 120_000,
    retry: false,
  });

  const slackChannelId =
    slackMetaQuery.data?.can_read
      ? slackMetaQuery.data.default_channel_id ?? null
      : null;

  const slackMessagesQuery = useQuery({
    queryKey: ['activity-feed', 'slack-messages', slackChannelId],
    queryFn: () => slackService.messages(slackChannelId!).then((r) => r.data),
    enabled: !!slackChannelId,
    staleTime: 45_000,
    retry: false,
  });

  const calendarQuery = useQuery({
    queryKey: ['activity-feed', 'calendar'],
    queryFn: () => calendarService.events().then((r) => r.data),
    enabled: calendarOn,
    staleTime: 60_000,
    retry: false,
  });

  const items = useMemo<FeedItem[]>(() => {
    const feed: FeedItem[] = [];

    for (const n of notifQuery.data ?? []) {
      const row = n as Record<string, unknown>;
      feed.push({
        id: `n-${row.id}`,
        source: 'notification',
        title: String(row.title || 'Notification'),
        body: String(row.message || ''),
        at: (row.created_at as string) || null,
        href: '/activity-feed',
      });
    }

    const gh = githubQuery.data;
    if (gh?.connected) {
      for (const pr of gh.pull_requests ?? []) {
        feed.push({
          id: `gh-pr-${pr.repo}-${pr.number}`,
          source: 'github',
          title: `PR #${pr.number}: ${pr.title}`,
          body: `${pr.repo} · ${pr.merged ? 'merged' : pr.state}`,
          at: pr.updated_at,
          href: '/integrations/github',
          externalUrl: pr.url,
          meta: pr.merged ? 'Merged' : pr.state,
        });
      }
      for (const c of gh.commits ?? []) {
        feed.push({
          id: `gh-c-${c.repo}-${c.sha}`,
          source: 'github',
          title: c.message.split('\n')[0] || c.short_sha,
          body: `${c.repo} · ${c.short_sha}`,
          at: c.authored_at,
          href: '/integrations/github',
          externalUrl: c.url,
          meta: 'Commit',
        });
      }
    }

    const jira = jiraQuery.data;
    if (jira?.connected) {
      for (const issue of jira.issues ?? []) {
        feed.push({
          id: `jira-${issue.key}`,
          source: 'jira',
          title: `${issue.key}: ${issue.summary}`,
          body: [issue.project, issue.status, issue.assignee].filter(Boolean).join(' · '),
          at: issue.updated,
          href: `/integrations/jira`,
          externalUrl: issue.url,
          meta: issue.status,
        });
      }
    }

    const messages = slackMessagesQuery.data?.messages ?? [];
    const channelName = slackMetaQuery.data?.default_channel;
    for (const m of messages.slice(-12).reverse()) {
      feed.push({
        id: `slack-${m.ts}`,
        source: 'slack',
        title: m.author || 'Slack message',
        body: m.text.slice(0, 180) + (m.text.length > 180 ? '…' : ''),
        at: m.created_at,
        href: '/integrations/slack',
        meta: channelName ? `#${channelName}` : 'Slack',
      });
    }

    const cal = calendarQuery.data;
    if (cal?.connected) {
      for (const ev of cal.events ?? []) {
        feed.push({
          id: `cal-${ev.id}`,
          source: 'calendar',
          title: ev.title || 'Calendar event',
          body: [
            ev.start_local && ev.end_local ? `${ev.start_local} – ${ev.end_local}` : null,
            ev.organizer ? `Organizer: ${ev.organizer}` : null,
            ev.attendees ? `${ev.attendees} attendees` : null,
          ]
            .filter(Boolean)
            .join(' · '),
          at: ev.started_at ?? ev.start_local,
          href: '/time',
          meta: cal.provider ?? 'Calendar',
        });
      }
    }

    return feed.sort((a, b) => parseTime(b.at) - parseTime(a.at));
  }, [
    notifQuery.data,
    githubQuery.data,
    jiraQuery.data,
    slackMessagesQuery.data,
    slackMetaQuery.data,
    calendarQuery.data,
  ]);

  const filtered = items.filter((item) => {
    if (filter === 'all') return true;
    if (filter === 'notifications') return item.source === 'notification';
    return item.source === filter;
  });

  const bootLoading = integrationsQuery.isLoading || notifQuery.isLoading;
  const refreshing =
    notifQuery.isFetching ||
    githubQuery.isFetching ||
    jiraQuery.isFetching ||
    slackMessagesQuery.isFetching ||
    calendarQuery.isFetching;

  const refreshAll = () => {
    void notifQuery.refetch();
    if (githubOn) void githubQuery.refetch();
    if (jiraOn) void jiraQuery.refetch();
    if (slackOn) void slackMetaQuery.refetch();
    if (slackChannelId) void slackMessagesQuery.refetch();
    if (calendarOn) void calendarQuery.refetch();
  };

  const tabs = [
    { id: 'all', label: 'All', icon: <Sparkles size={14} />, count: items.length },
    { id: 'notifications', label: 'Alerts', icon: <Bell size={14} /> },
    ...(jiraOn ? [{ id: 'jira', label: 'Jira', icon: <Trello size={14} /> }] : []),
    ...(githubOn ? [{ id: 'github', label: 'GitHub', icon: <Github size={14} /> }] : []),
    ...(slackOn ? [{ id: 'slack', label: 'Slack', icon: <MessageSquare size={14} /> }] : []),
    ...(calendarOn ? [{ id: 'calendar', label: 'Calendar', icon: <CalendarDays size={14} /> }] : []),
  ];

  if (bootLoading) return <PageSkeleton />;

  const connectedCount = [githubOn, jiraOn, slackOn, calendarOn].filter(Boolean).length;

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Activity className="text-primary-400" /> Activity Feed
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Live updates from FlowTrack
            {connectedCount > 0 ? ` and ${connectedCount} connected tool${connectedCount === 1 ? '' : 's'}` : ''}
            {user?.first_name ? ` for ${user.first_name}` : ''}.
          </p>
        </div>
        <Button
          size="sm"
          variant="secondary"
          className="!rounded-xl gap-2"
          onClick={refreshAll}
          isLoading={refreshing}
        >
          <RefreshCw size={14} className={cn(refreshing && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      {connectedCount === 0 && (
        <Card className="flex items-center gap-3 border-amber-500/20 bg-amber-500/5">
          <Plug className="text-amber-300 shrink-0" size={18} />
          <div className="min-w-0 flex-1">
            <p className="text-sm text-amber-100 font-medium">No integrations connected yet</p>
            <p className="text-xs text-amber-200/70 mt-0.5">
              Connect Jira, GitHub, Slack, or Calendar to see live work here.
            </p>
          </div>
          <Link to="/integrations" className="text-xs font-bold text-amber-200 hover:underline shrink-0">
            Connect
          </Link>
        </Card>
      )}

      {slackOn && slackMetaQuery.data && !slackMetaQuery.data.can_read && (
        <Card className="text-xs text-slate-400 border-white/10">
          Slack is connected for posting, but channel history needs a reconnect with read scopes.
          <Link to="/integrations" className="ml-1 text-primary-400 hover:underline">Reconnect Slack</Link>
        </Card>
      )}

      <Tabs
        tabs={tabs}
        activeId={filter}
        onChange={(id) => setFilter(id as FeedFilter)}
        size="sm"
      />

      {filtered.length === 0 ? (
        <EmptyState
          icon={Activity}
          title="Nothing in this feed yet"
          description={
            connectedCount === 0
              ? 'Connect Slack, Jira, or GitHub — or keep working — and updates will show up here.'
              : 'No recent events for this filter. Try Refresh or switch tabs.'
          }
          actionLabel="Open Integrations"
          onAction={() => { window.location.href = '/integrations'; }}
        />
      ) : (
        <ul className="space-y-3">
          {filtered.map((item) => {
            const meta = sourceMeta[item.source];
            const Icon = meta.icon;
            return (
              <li key={item.id}>
                <Card hover className="flex items-start gap-3">
                  <div className={`p-2 rounded-xl bg-white/5 ${meta.color}`}>
                    <Icon size={16} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-white">{item.title}</p>
                      <Badge variant="default">{meta.label}</Badge>
                      {item.meta && <Badge variant="info">{item.meta}</Badge>}
                    </div>
                    {item.body && <p className="text-xs text-slate-400 mt-1 whitespace-pre-wrap">{item.body}</p>}
                    <div className="flex items-center justify-between mt-2 gap-2 flex-wrap">
                      <span className="text-[10px] text-slate-600">
                        {item.at ? new Date(item.at).toLocaleString() : 'Just now'}
                      </span>
                      <div className="flex items-center gap-3">
                        {item.externalUrl && (
                          <a
                            href={item.externalUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-400 hover:text-white"
                          >
                            Open <ExternalLink size={11} />
                          </a>
                        )}
                        {item.href && (
                          <Link to={item.href} className="text-[11px] font-semibold text-primary-400 hover:underline">
                            In FlowTrack
                          </Link>
                        )}
                      </div>
                    </div>
                  </div>
                  {item.source === 'notification' && (
                    <Avatar name={user?.first_name} size="sm" />
                  )}
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
