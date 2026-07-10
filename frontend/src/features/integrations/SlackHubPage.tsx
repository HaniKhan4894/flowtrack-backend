import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Slack, Loader2, RefreshCw, Search, ChevronLeft, Send, Hash, Lock,
} from 'lucide-react';
import {
  slackService,
  type SlackChannel,
  type SlackMessage,
  type SlackWorkspaceMeta,
} from '../../api/slackService';
import { getApiErrorMessage } from '../../utils/apiError';
import ListPagination from '../../components/ListPagination';

const SlackHubPage = () => {
  const [meta, setMeta] = useState<SlackWorkspaceMeta | null>(null);
  const [channels, setChannels] = useState<SlackChannel[]>([]);
  const [channelPage, setChannelPage] = useState(1);
  const [channelsHasMore, setChannelsHasMore] = useState(false);
  const channelCursorsRef = useRef<(string | null)[]>([null]);
  const [selectedChannel, setSelectedChannel] = useState<SlackChannel | null>(null);
  const [messages, setMessages] = useState<SlackMessage[]>([]);
  const [msgPage, setMsgPage] = useState(1);
  const [messagesHasMore, setMessagesHasMore] = useState(false);
  const msgCursorsRef = useRef<(string | null)[]>([null]);
  const [loadingChannels, setLoadingChannels] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const loadMeta = useCallback(async () => {
    try {
      const r = await slackService.meta();
      setMeta(r.data);
    } catch (e) {
      setError(getApiErrorMessage(e, 'Failed to load Slack status'));
    }
  }, []);

  const loadChannels = useCallback(async (page = 1) => {
    setLoadingChannels(true);
    setError(null);
    try {
      const cursor = channelCursorsRef.current[page - 1] ?? undefined;
      const r = await slackService.channels(cursor ?? undefined);
      setChannels(r.data.channels);
      setChannelPage(page);
      setChannelsHasMore(!!r.data.has_more);
      if (r.data.next_cursor) {
        channelCursorsRef.current[page] = r.data.next_cursor;
      }
      if (r.data.channels.length > 0) {
        setSelectedChannel((prev) => {
          if (prev && r.data.channels.some((c) => c.id === prev.id)) return prev;
          const defaultId = meta?.default_channel_id;
          const match = defaultId ? r.data.channels.find((c) => c.id === defaultId) : null;
          return match ?? r.data.channels[0];
        });
      }
    } catch (e) {
      setError(getApiErrorMessage(e, 'Failed to load channels'));
      setChannels([]);
    } finally {
      setLoadingChannels(false);
    }
  }, [meta?.default_channel_id]);

  const loadMessages = useCallback(async (channelId: string, page = 1) => {
    setLoadingMessages(true);
    setError(null);
    try {
      const cursor = msgCursorsRef.current[page - 1] ?? undefined;
      const r = await slackService.messages(channelId, cursor ?? undefined);
      setMessages(r.data.messages);
      setMsgPage(page);
      setMessagesHasMore(!!r.data.has_more);
      if (r.data.next_cursor) {
        msgCursorsRef.current[page] = r.data.next_cursor;
      }
    } catch (e) {
      setError(getApiErrorMessage(e, 'Failed to load messages'));
      setMessages([]);
    } finally {
      setLoadingMessages(false);
    }
  }, []);

  useEffect(() => {
    void loadMeta();
  }, [loadMeta]);

  useEffect(() => {
    if (meta?.connected && meta.can_read) {
      channelCursorsRef.current = [null];
      setChannelPage(1);
      void loadChannels(1);
    } else {
      setLoadingChannels(false);
    }
  }, [meta?.connected, meta?.can_read, loadChannels]);

  useEffect(() => {
    if (selectedChannel) {
      msgCursorsRef.current = [null];
      setMsgPage(1);
      void loadMessages(selectedChannel.id, 1);
    } else {
      setMessages([]);
    }
  }, [selectedChannel, loadMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const postMessage = async () => {
    if (!selectedChannel || !draft.trim()) return;
    setSending(true);
    setError(null);
    try {
      await slackService.sendToChannel(selectedChannel.id, draft.trim());
      setDraft('');
      msgCursorsRef.current = [null];
      setMsgPage(1);
      await loadMessages(selectedChannel.id, 1);
    } catch (e) {
      setError(getApiErrorMessage(e, 'Failed to send message'));
    } finally {
      setSending(false);
    }
  };

  const filteredChannels = channels.filter((c) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return c.name.toLowerCase().includes(q) || c.topic.toLowerCase().includes(q);
  });

  if (meta && !meta.connected) {
    return (
      <div className="max-w-2xl mx-auto text-center py-16">
        <div className="h-14 w-14 rounded-2xl bg-[#4A154B] flex items-center justify-center text-white mx-auto mb-4">
          <Slack size={28} />
        </div>
        <h1 className="text-2xl font-bold text-white">Connect Slack first</h1>
        <p className="text-slate-400 mt-2 text-sm">
          Link Slack in Integrations, then browse channels and send messages from FlowTrack.
        </p>
        <Link to="/integrations" className="inline-block mt-6 px-5 py-2.5 rounded-xl bg-[#4A154B] text-white text-sm font-bold">
          Go to Integrations
        </Link>
      </div>
    );
  }

  if (meta?.connected && !meta.can_read) {
    return (
      <div className="max-w-2xl mx-auto text-center py-16">
        <div className="h-14 w-14 rounded-2xl bg-[#4A154B] flex items-center justify-center text-white mx-auto mb-4">
          <Slack size={28} />
        </div>
        <h1 className="text-2xl font-bold text-white">Reconnect Slack for full workspace</h1>
        <p className="text-slate-400 mt-2 text-sm">
          Your current connection can only post to one channel. Reconnect Slack in Integrations to browse channels and read messages.
        </p>
        <Link to="/integrations" className="inline-block mt-6 px-5 py-2.5 rounded-xl bg-[#4A154B] text-white text-sm font-bold">
          Reconnect in Integrations
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
            <Slack size={24} className="text-[#E01E5A]" /> Slack Workspace
            {meta?.team_name && <span className="text-sm font-normal text-slate-500">{meta.team_name}</span>}
          </h1>
        </div>
        <button
          onClick={() => {
            void loadChannels(channelPage);
            if (selectedChannel) void loadMessages(selectedChannel.id, msgPage);
          }}
          disabled={loadingChannels || loadingMessages}
          className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/5"
        >
          <RefreshCw size={18} className={loadingChannels || loadingMessages ? 'animate-spin' : ''} />
        </button>
      </div>

      {error && <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-sm">{error}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,300px)_1fr] gap-4 lg:h-[calc(100vh-220px)] lg:min-h-[520px]">
        {/* Channels */}
        <div className="glass rounded-2xl border border-white/5 overflow-hidden flex flex-col min-h-0 max-h-[70vh] lg:max-h-full lg:h-full">
          <div className="p-3 border-b border-white/5 shrink-0">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search channels…"
                className="w-full bg-white/5 border border-white/10 rounded-lg pl-9 pr-3 py-2 text-xs text-white outline-none focus:border-[#E01E5A]/50"
              />
            </div>
          </div>
          <div className="overflow-y-auto flex-1 min-h-0">
            {loadingChannels ? (
              <div className="p-6 flex items-center gap-2 text-slate-400 text-sm">
                <Loader2 size={16} className="animate-spin" /> Loading channels…
              </div>
            ) : filteredChannels.length === 0 ? (
              <p className="p-6 text-slate-500 text-sm">No channels found. Invite the FlowTrack bot to channels in Slack.</p>
            ) : (
              filteredChannels.map((ch) => (
                <button
                  key={ch.id}
                  onClick={() => setSelectedChannel(ch)}
                  className={`w-full text-left px-4 py-3 border-b border-white/5 flex items-start gap-2 ${
                    selectedChannel?.id === ch.id ? 'bg-[#4A154B]/20 border-l-2 border-l-[#E01E5A]' : 'hover:bg-white/[0.03]'
                  }`}
                >
                  {ch.is_private ? (
                    <Lock size={14} className="text-slate-400 shrink-0 mt-0.5" />
                  ) : (
                    <Hash size={14} className="text-slate-400 shrink-0 mt-0.5" />
                  )}
                  <div className="min-w-0">
                    <p className="text-sm text-white truncate">{ch.name}</p>
                    {ch.topic && <p className="text-[11px] text-slate-500 truncate">{ch.topic}</p>}
                  </div>
                </button>
              ))
            )}
          </div>
          <ListPagination
            page={channelPage}
            hasMore={channelsHasMore}
            loading={loadingChannels}
            label="Channels"
            onPrev={() => void loadChannels(channelPage - 1)}
            onNext={() => void loadChannels(channelPage + 1)}
          />
        </div>

        {/* Messages */}
        <div className="glass rounded-2xl border border-white/5 overflow-hidden flex flex-col min-h-0 max-h-[70vh] lg:max-h-full lg:h-full">
          {!selectedChannel ? (
            <p className="p-8 text-slate-500 text-sm">Select a channel to view messages.</p>
          ) : (
            <>
              <div className="px-4 py-3 border-b border-white/5 shrink-0 flex items-center gap-2">
                {selectedChannel.is_private ? <Lock size={16} className="text-slate-400" /> : <Hash size={16} className="text-slate-400" />}
                <span className="font-bold text-white text-sm">{selectedChannel.name}</span>
                {selectedChannel.num_members > 0 && (
                  <span className="text-[11px] text-slate-500">{selectedChannel.num_members} members</span>
                )}
              </div>

              <div className="flex-1 overflow-y-auto min-h-0 p-4 space-y-3">
                {loadingMessages && messages.length === 0 ? (
                  <div className="flex items-center gap-2 text-slate-400 text-sm">
                    <Loader2 size={16} className="animate-spin" /> Loading messages…
                  </div>
                ) : messages.length === 0 ? (
                  <p className="text-slate-500 text-sm">
                    No messages yet. Make sure the FlowTrack bot is invited to #{selectedChannel.name} in Slack.
                  </p>
                ) : (
                  messages.map((m) => (
                    <div key={m.ts} className="rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-xs font-bold text-[#E01E5A]">{m.author}</span>
                        {m.created_at && (
                          <span className="text-[10px] text-slate-600 shrink-0">
                            {new Date(m.created_at).toLocaleString()}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-slate-200 whitespace-pre-wrap mt-1">{m.text}</p>
                    </div>
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>

              <ListPagination
                page={msgPage}
                hasMore={messagesHasMore}
                loading={loadingMessages}
                label="Messages"
                onPrev={() => selectedChannel && void loadMessages(selectedChannel.id, msgPage - 1)}
                onNext={() => selectedChannel && void loadMessages(selectedChannel.id, msgPage + 1)}
              />

              <div className="p-3 border-t border-white/5 shrink-0 flex gap-2">
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder={`Message #${selectedChannel.name}…`}
                  className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-[#E01E5A]/50"
                  onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && void postMessage()}
                />
                <button
                  onClick={() => void postMessage()}
                  disabled={sending || !draft.trim()}
                  className="px-3 py-2 rounded-xl bg-[#4A154B] text-white disabled:opacity-50"
                >
                  {sending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default SlackHubPage;
