import { useEffect, useState } from 'react';
import { Sparkles, Loader2, CheckCircle2, Trash2, Eye, EyeOff, Github, Slack, Trello, Send, CalendarDays, MessageSquare } from 'lucide-react';
import { integrationsService, type Integration } from '../../api/integrationsService';
import { slackService } from '../../api/slackService';
import { teamsService } from '../../api/teamsService';
import { getApiErrorMessage } from '../../utils/apiError';

const OPENAI_MODELS = ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini', 'gpt-4.1'];

const emptyIntegration = (provider: string, auth_type: 'api_key' | 'oauth'): Integration => ({
  provider,
  connected: false,
  is_enabled: false,
  auth_type,
  external_account_id: null,
  settings: {},
});

const IntegrationsSettings = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [openai, setOpenai] = useState<Integration>(emptyIntegration('openai', 'api_key'));
  const [github, setGithub] = useState<Integration>(emptyIntegration('github', 'oauth'));
  const [slack, setSlack] = useState<Integration>(emptyIntegration('slack', 'oauth'));
  const [jira, setJira] = useState<Integration>(emptyIntegration('jira', 'oauth'));
  const [googleCalendar, setGoogleCalendar] = useState<Integration>(emptyIntegration('google_calendar', 'oauth'));
  const [microsoft, setMicrosoft] = useState<Integration>(emptyIntegration('microsoft', 'oauth'));
  const [teams, setTeams] = useState<Integration>(emptyIntegration('teams', 'api_key'));

  const [teamsWebhook, setTeamsWebhook] = useState('');
  const [testingTeams, setTestingTeams] = useState(false);

  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [model, setModel] = useState('gpt-4o-mini');
  const [connecting, setConnecting] = useState<string | null>(null);
  const [testingSlack, setTestingSlack] = useState(false);
  const [slackMessage, setSlackMessage] = useState('');
  const [postingSlack, setPostingSlack] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await integrationsService.list();
      const byProvider = new Map(res.data.map((i) => [i.provider, i]));
      const oa = byProvider.get('openai') ?? emptyIntegration('openai', 'api_key');
      const gh = byProvider.get('github') ?? emptyIntegration('github', 'oauth');
      setOpenai(oa);
      setGithub(gh);
      setSlack(byProvider.get('slack') ?? emptyIntegration('slack', 'oauth'));
      setJira(byProvider.get('jira') ?? emptyIntegration('jira', 'oauth'));
      setGoogleCalendar(byProvider.get('google_calendar') ?? emptyIntegration('google_calendar', 'oauth'));
      setMicrosoft(byProvider.get('microsoft') ?? emptyIntegration('microsoft', 'oauth'));
      setTeams(byProvider.get('teams') ?? emptyIntegration('teams', 'api_key'));
      if (oa.settings?.model) setModel(String(oa.settings.model));
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to load integrations'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // Handle OAuth return (?connected=github or ?integration_error=...)
    const params = new URLSearchParams(window.location.search);
    if (params.get('connected')) {
      setSuccess(`${params.get('connected')} connected successfully.`);
      cleanUrl();
    } else if (params.get('integration_error')) {
      setError(params.get('integration_error'));
      cleanUrl();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cleanUrl = () => {
    const url = new URL(window.location.href);
    ['connected', 'integration_error', 'tab'].forEach((k) => url.searchParams.delete(k));
    window.history.replaceState({}, '', url.toString());
  };

  const saveOpenai = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const payload: { api_key?: string; model?: string } = { model };
      if (apiKey.trim()) payload.api_key = apiKey.trim();
      const res = await integrationsService.save('openai', payload);
      setOpenai(res.data);
      setApiKey('');
      setSuccess('OpenAI integration saved. AI features are now powered by your key.');
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to save integration'));
    } finally {
      setSaving(false);
    }
  };

  const LABELS: Record<string, string> = {
    openai: 'OpenAI', github: 'GitHub', slack: 'Slack', jira: 'Jira',
    google_calendar: 'Google Calendar', microsoft: 'Outlook Calendar', teams: 'Microsoft Teams',
  };

  const saveTeams = async () => {
    const url = teamsWebhook.trim();
    if (!url) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await integrationsService.save('teams', { api_key: url });
      setTeams(res.data);
      setTeamsWebhook('');
      setSuccess('Microsoft Teams connected. FlowTrack alerts can now post to your channel.');
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to save Teams webhook'));
    } finally {
      setSaving(false);
    }
  };

  const sendTeamsTest = async () => {
    setTestingTeams(true);
    setError(null);
    setSuccess(null);
    try {
      await teamsService.test();
      setSuccess('Test message sent — check your Teams channel.');
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to send Teams test message'));
    } finally {
      setTestingTeams(false);
    }
  };

  const disconnect = async (provider: string) => {
    const label = LABELS[provider] ?? provider;
    if (!confirm(`Disconnect ${label}?`)) return;
    setSaving(true);
    setError(null);
    try {
      await integrationsService.disconnect(provider);
      await load();
      setSuccess(`${label} disconnected.`);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to disconnect'));
    } finally {
      setSaving(false);
    }
  };

  const connectOAuth = async (provider: string) => {
    setConnecting(provider);
    setError(null);
    try {
      const res = await integrationsService.connect(provider);
      window.location.href = res.data.url;
    } catch (err) {
      setError(getApiErrorMessage(err, `Failed to start ${LABELS[provider] ?? provider} connection`));
      setConnecting(null);
    }
  };

  const sendSlackTest = async () => {
    setTestingSlack(true);
    setError(null);
    setSuccess(null);
    try {
      await slackService.test();
      setSuccess('Test message sent — check your Slack channel.');
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to send Slack test message'));
    } finally {
      setTestingSlack(false);
    }
  };

  const postSlackMessage = async () => {
    const text = slackMessage.trim();
    if (!text) return;
    setPostingSlack(true);
    setError(null);
    setSuccess(null);
    try {
      await slackService.send(text);
      setSlackMessage('');
      setSuccess('Message posted to Slack.');
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to post message to Slack'));
    } finally {
      setPostingSlack(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-7 h-7 animate-spin text-violet-400" />
      </div>
    );
  }

  const openaiConnected = openai.connected && openai.is_enabled;
  const keyHint = openai.settings?.key_hint as string | undefined;
  const githubAccount = (github.settings?.account_name as string | undefined) ?? github.external_account_id ?? undefined;
  const slackAccount = (slack.settings?.account_name as string | undefined) ?? (slack.settings?.team_name as string | undefined);
  const slackChannel = slack.settings?.channel as string | undefined;
  const jiraAccount = (jira.settings?.account_name as string | undefined) ?? (jira.settings?.site_name as string | undefined);
  const jiraUrl = jira.settings?.site_url as string | undefined;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-white">Integrations</h2>
        <p className="text-slate-400 mt-1 text-sm">
          Connect third-party services to your organization. Credentials are encrypted and used only for your team.
        </p>
      </div>

      {error && <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{error}</div>}
      {success && <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm">{success}</div>}

      {/* OpenAI (API key) */}
      <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
        <div className="flex items-center gap-3">
          <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-ai-gradient shadow-ai">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="text-white font-semibold flex items-center gap-2">
              OpenAI
              {openaiConnected && (
                <span className="inline-flex items-center gap-1 text-xs text-emerald-400">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Connected
                </span>
              )}
            </h3>
            <p className="text-xs text-slate-400">
              Powers Ask FlowTrack, AI summaries and more. Billed to your own OpenAI account.
            </p>
          </div>
        </div>

        <div className="mt-5 space-y-4">
          <div>
            <label className="block text-sm text-slate-300 mb-1">
              API Key {openaiConnected && keyHint && <span className="text-slate-500">(saved: ••••{keyHint})</span>}
            </label>
            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={openaiConnected ? 'Enter a new key to replace the saved one' : 'sk-...'}
                autoComplete="off"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 pr-10 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-violet-400/60"
              />
              <button
                type="button"
                onClick={() => setShowKey((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
              >
                {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Get one at platform.openai.com/api-keys. We never expose the key after saving.
            </p>
          </div>

          <div>
            <label className="block text-sm text-slate-300 mb-1">Model</label>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-violet-400/60"
            >
              {OPENAI_MODELS.map((m) => (
                <option key={m} value={m} className="bg-slate-900">{m}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={saveOpenai}
              disabled={saving || (!apiKey.trim() && !openai.connected)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-500 disabled:opacity-50 transition"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {openai.connected ? 'Update' : 'Connect'}
            </button>
            {openai.connected && (
              <button
                onClick={() => disconnect('openai')}
                disabled={saving}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-white/5 text-red-400 text-sm hover:bg-white/10 transition"
              >
                <Trash2 className="w-4 h-4" /> Disconnect
              </button>
            )}
          </div>
        </div>
      </div>

      {/* GitHub (OAuth) */}
      <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-white/10">
              <Github className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-white font-semibold flex items-center gap-2">
                GitHub
                {github.connected && (
                  <span className="inline-flex items-center gap-1 text-xs text-emerald-400">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Connected
                  </span>
                )}
              </h3>
              <p className="text-xs text-slate-400">
                {github.connected && githubAccount
                  ? `Connected as ${githubAccount}`
                  : 'Connect your GitHub account to link commits & pull requests to tracked time.'}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 mt-5">
          {github.connected ? (
            <>
              <button
                onClick={() => connectOAuth('github')}
                disabled={connecting === 'github'}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-white/10 text-white text-sm font-medium hover:bg-white/20 disabled:opacity-50 transition"
              >
                {connecting === 'github' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Github className="w-4 h-4" />}
                Reconnect
              </button>
              <button
                onClick={() => disconnect('github')}
                disabled={saving}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-white/5 text-red-400 text-sm hover:bg-white/10 transition"
              >
                <Trash2 className="w-4 h-4" /> Disconnect
              </button>
            </>
          ) : (
            <button
              onClick={() => connectOAuth('github')}
              disabled={connecting === 'github'}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#24292f] text-white text-sm font-medium hover:bg-[#30363d] disabled:opacity-50 transition"
            >
              {connecting === 'github' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Github className="w-4 h-4" />}
              Connect with GitHub
            </button>
          )}
        </div>
      </div>

      {/* Slack (OAuth) */}
      <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
        <div className="flex items-center gap-3">
          <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-[#4A154B]">
            <Slack className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="text-white font-semibold flex items-center gap-2">
              Slack
              {slack.connected && (
                <span className="inline-flex items-center gap-1 text-xs text-emerald-400">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Connected
                </span>
              )}
            </h3>
            <p className="text-xs text-slate-400">
              {slack.connected
                ? `Posting to ${slackAccount ?? 'your workspace'}${slackChannel ? ` · ${slackChannel}` : ''}`
                : 'Send standups and summaries to a Slack channel.'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 mt-5">
          {slack.connected ? (
            <>
              <button
                onClick={sendSlackTest}
                disabled={testingSlack}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-500 disabled:opacity-50 transition"
              >
                {testingSlack ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Send test message
              </button>
              <button
                onClick={() => connectOAuth('slack')}
                disabled={connecting === 'slack'}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-white/10 text-white text-sm hover:bg-white/20 disabled:opacity-50 transition"
              >
                {connecting === 'slack' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Slack className="w-4 h-4" />}
                Reconnect
              </button>
              <button
                onClick={() => disconnect('slack')}
                disabled={saving}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-white/5 text-red-400 text-sm hover:bg-white/10 transition"
              >
                <Trash2 className="w-4 h-4" /> Disconnect
              </button>
            </>
          ) : (
            <button
              onClick={() => connectOAuth('slack')}
              disabled={connecting === 'slack'}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#4A154B] text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 transition"
            >
              {connecting === 'slack' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Slack className="w-4 h-4" />}
              Add to Slack
            </button>
          )}
        </div>

        {slack.connected && (
          <div className="mt-4 border-t border-white/10 pt-4">
            <label className="block text-xs font-medium text-slate-300 mb-2">
              Post a message to Slack
            </label>
            <textarea
              value={slackMessage}
              onChange={(e) => setSlackMessage(e.target.value)}
              rows={3}
              placeholder="Type an update to send to your Slack channel…"
              className="w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-violet-500 resize-y"
            />
            <div className="flex justify-end mt-2">
              <button
                onClick={postSlackMessage}
                disabled={postingSlack || !slackMessage.trim()}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-500 disabled:opacity-50 transition"
              >
                {postingSlack ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Post to Slack
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Microsoft Teams (incoming webhook) */}
      <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
        <div className="flex items-center gap-3">
          <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-[#4B53BC]">
            <MessageSquare className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="text-white font-semibold flex items-center gap-2">
              Microsoft Teams
              {teams.connected && (
                <span className="inline-flex items-center gap-1 text-xs text-emerald-400">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Connected
                </span>
              )}
            </h3>
            <p className="text-xs text-slate-400">
              {teams.connected
                ? 'FlowTrack alerts and automations can post to your Teams channel.'
                : 'Paste a Teams channel Incoming Webhook URL to receive alerts and standups.'}
            </p>
          </div>
        </div>

        <div className="mt-5 space-y-3">
          <input
            type="url"
            value={teamsWebhook}
            onChange={(e) => setTeamsWebhook(e.target.value)}
            placeholder={teams.connected ? 'Paste a new webhook URL to replace the saved one' : 'https://outlook.office.com/webhook/…'}
            autoComplete="off"
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-violet-400/60"
          />
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={saveTeams}
              disabled={saving || !teamsWebhook.trim()}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#4B53BC] text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 transition"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageSquare className="w-4 h-4" />}
              {teams.connected ? 'Update webhook' : 'Connect Teams'}
            </button>
            {teams.connected && (
              <>
                <button
                  onClick={sendTeamsTest}
                  disabled={testingTeams}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-500 disabled:opacity-50 transition"
                >
                  {testingTeams ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  Send test message
                </button>
                <button
                  onClick={() => disconnect('teams')}
                  disabled={saving}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-white/5 text-red-400 text-sm hover:bg-white/10 transition"
                >
                  <Trash2 className="w-4 h-4" /> Disconnect
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Jira (OAuth) */}
      <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
        <div className="flex items-center gap-3">
          <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-[#0052CC]">
            <Trello className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="text-white font-semibold flex items-center gap-2">
              Jira
              {jira.connected && (
                <span className="inline-flex items-center gap-1 text-xs text-emerald-400">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Connected
                </span>
              )}
            </h3>
            <p className="text-xs text-slate-400">
              {jira.connected
                ? `Connected to ${jiraAccount ?? jiraUrl ?? 'your Jira site'}`
                : 'Log time against Jira issues and push worklogs back to Jira.'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 mt-5">
          {jira.connected ? (
            <>
              <button
                onClick={() => connectOAuth('jira')}
                disabled={connecting === 'jira'}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-white/10 text-white text-sm hover:bg-white/20 disabled:opacity-50 transition"
              >
                {connecting === 'jira' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trello className="w-4 h-4" />}
                Reconnect
              </button>
              <button
                onClick={() => disconnect('jira')}
                disabled={saving}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-white/5 text-red-400 text-sm hover:bg-white/10 transition"
              >
                <Trash2 className="w-4 h-4" /> Disconnect
              </button>
            </>
          ) : (
            <button
              onClick={() => connectOAuth('jira')}
              disabled={connecting === 'jira'}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#0052CC] text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 transition"
            >
              {connecting === 'jira' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trello className="w-4 h-4" />}
              Connect with Jira
            </button>
          )}
        </div>
      </div>

      {/* Google Calendar (OAuth) */}
      <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
        <div className="flex items-center gap-3">
          <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-[#1a73e8]">
            <CalendarDays className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="text-white font-semibold flex items-center gap-2">
              Google Calendar
              {googleCalendar.connected && (
                <span className="inline-flex items-center gap-1 text-xs text-emerald-400">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Connected
                </span>
              )}
            </h3>
            <p className="text-xs text-slate-400">
              {googleCalendar.connected
                ? `Connected as ${(googleCalendar.settings?.account_email as string) ?? (googleCalendar.settings?.account_name as string) ?? 'your account'}`
                : 'Turn meetings into billable time entries and feed Autopilot.'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 mt-5">
          {googleCalendar.connected ? (
            <>
              <button
                onClick={() => connectOAuth('google_calendar')}
                disabled={connecting === 'google_calendar'}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-white/10 text-white text-sm hover:bg-white/20 disabled:opacity-50 transition"
              >
                {connecting === 'google_calendar' ? <Loader2 className="w-4 h-4 animate-spin" /> : <CalendarDays className="w-4 h-4" />}
                Reconnect
              </button>
              <button
                onClick={() => disconnect('google_calendar')}
                disabled={saving}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-white/5 text-red-400 text-sm hover:bg-white/10 transition"
              >
                <Trash2 className="w-4 h-4" /> Disconnect
              </button>
            </>
          ) : (
            <button
              onClick={() => connectOAuth('google_calendar')}
              disabled={connecting === 'google_calendar'}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#1a73e8] text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 transition"
            >
              {connecting === 'google_calendar' ? <Loader2 className="w-4 h-4 animate-spin" /> : <CalendarDays className="w-4 h-4" />}
              Connect Google Calendar
            </button>
          )}
        </div>
      </div>

      {/* Outlook / Microsoft 365 Calendar (OAuth) */}
      <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
        <div className="flex items-center gap-3">
          <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-[#0078D4]">
            <CalendarDays className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="text-white font-semibold flex items-center gap-2">
              Outlook Calendar
              {microsoft.connected && (
                <span className="inline-flex items-center gap-1 text-xs text-emerald-400">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Connected
                </span>
              )}
            </h3>
            <p className="text-xs text-slate-400">
              {microsoft.connected
                ? `Connected as ${(microsoft.settings?.account_email as string) ?? (microsoft.settings?.account_name as string) ?? 'your account'}`
                : 'Microsoft 365 / Outlook meetings become time entries and feed Autopilot.'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 mt-5">
          {microsoft.connected ? (
            <>
              <button
                onClick={() => connectOAuth('microsoft')}
                disabled={connecting === 'microsoft'}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-white/10 text-white text-sm hover:bg-white/20 disabled:opacity-50 transition"
              >
                {connecting === 'microsoft' ? <Loader2 className="w-4 h-4 animate-spin" /> : <CalendarDays className="w-4 h-4" />}
                Reconnect
              </button>
              <button
                onClick={() => disconnect('microsoft')}
                disabled={saving}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-white/5 text-red-400 text-sm hover:bg-white/10 transition"
              >
                <Trash2 className="w-4 h-4" /> Disconnect
              </button>
            </>
          ) : (
            <button
              onClick={() => connectOAuth('microsoft')}
              disabled={connecting === 'microsoft'}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#0078D4] text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 transition"
            >
              {connecting === 'microsoft' ? <Loader2 className="w-4 h-4 animate-spin" /> : <CalendarDays className="w-4 h-4" />}
              Connect Outlook
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default IntegrationsSettings;
