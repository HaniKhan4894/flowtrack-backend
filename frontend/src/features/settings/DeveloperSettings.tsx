import { useEffect, useState } from 'react';
import { Loader2, Plus, Trash2, KeyRound, Webhook, Zap, Copy, Check, Send, X } from 'lucide-react';
import {
  developerService,
  type ApiKey,
  type CreatedApiKey,
  type WebhookEndpoint,
  type CreatedWebhook,
  type Automation,
  type AutomationMeta,
  type AutomationAction,
  type AutomationCondition,
} from '../../api/developerService';
import { getApiErrorMessage } from '../../utils/apiError';

type Section = 'api-keys' | 'webhooks' | 'automations';

const CONDITION_OPS: AutomationCondition['op'][] = ['==', '!=', '>', '>=', '<', '<=', 'contains'];

const humanize = (s: string) => s.replace(/[._]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

const DeveloperSettings = () => {
  const [section, setSection] = useState<Section>('api-keys');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // API keys
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [keysLoading, setKeysLoading] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [creatingKey, setCreatingKey] = useState(false);
  const [freshKey, setFreshKey] = useState<CreatedApiKey | null>(null);
  const [copied, setCopied] = useState(false);

  // Webhooks
  const [hooks, setHooks] = useState<WebhookEndpoint[]>([]);
  const [hookEvents, setHookEvents] = useState<string[]>([]);
  const [hooksLoading, setHooksLoading] = useState(false);
  const [newHookUrl, setNewHookUrl] = useState('');
  const [newHookEvents, setNewHookEvents] = useState<string[]>([]);
  const [creatingHook, setCreatingHook] = useState(false);
  const [freshHook, setFreshHook] = useState<CreatedWebhook | null>(null);
  const [testingHookId, setTestingHookId] = useState<number | null>(null);

  // Automations
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [meta, setMeta] = useState<AutomationMeta>({ triggers: [], actions: [] });
  const [autoLoading, setAutoLoading] = useState(false);
  const [showBuilder, setShowBuilder] = useState(false);
  const [savingAuto, setSavingAuto] = useState(false);
  const [builder, setBuilder] = useState<{
    name: string;
    trigger_event: string;
    conditions: AutomationCondition[];
    actions: AutomationAction[];
    is_active: boolean;
  }>({ name: '', trigger_event: '', conditions: [], actions: [], is_active: true });

  const flash = (msg: string) => {
    setSuccess(msg);
    setTimeout(() => setSuccess(null), 3500);
  };

  // ── Loaders ───────────────────────────────────────────────────────────
  const loadKeys = async () => {
    setKeysLoading(true);
    try {
      const res = await developerService.listApiKeys();
      setKeys(res.data ?? []);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to load API keys'));
    } finally {
      setKeysLoading(false);
    }
  };

  const loadHooks = async () => {
    setHooksLoading(true);
    try {
      const res = await developerService.listWebhooks();
      setHooks(res.data.endpoints ?? []);
      setHookEvents(res.data.events ?? []);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to load webhooks'));
    } finally {
      setHooksLoading(false);
    }
  };

  const loadAutomations = async () => {
    setAutoLoading(true);
    try {
      const res = await developerService.listAutomations();
      setAutomations(res.data.automations ?? []);
      setMeta(res.data.meta ?? { triggers: [], actions: [] });
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to load automations'));
    } finally {
      setAutoLoading(false);
    }
  };

  useEffect(() => {
    if (section === 'api-keys') void loadKeys();
    if (section === 'webhooks') void loadHooks();
    if (section === 'automations') void loadAutomations();
  }, [section]);

  // ── API key handlers ──────────────────────────────────────────────────
  const handleCreateKey = async () => {
    setCreatingKey(true);
    setError(null);
    try {
      const res = await developerService.createApiKey(newKeyName.trim() || 'API key');
      setFreshKey(res.data);
      setNewKeyName('');
      await loadKeys();
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to create API key'));
    } finally {
      setCreatingKey(false);
    }
  };

  const handleRevokeKey = async (id: number) => {
    if (!window.confirm('Revoke this API key? Applications using it will stop working.')) return;
    try {
      await developerService.revokeApiKey(id);
      await loadKeys();
      flash('API key revoked');
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to revoke API key'));
    }
  };

  const copyKey = async () => {
    if (!freshKey) return;
    await navigator.clipboard.writeText(freshKey.plaintext);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ── Webhook handlers ──────────────────────────────────────────────────
  const toggleNewHookEvent = (ev: string) => {
    setNewHookEvents((prev) => (prev.includes(ev) ? prev.filter((e) => e !== ev) : [...prev, ev]));
  };

  const handleCreateHook = async () => {
    setCreatingHook(true);
    setError(null);
    try {
      const res = await developerService.createWebhook(newHookUrl.trim(), newHookEvents);
      setFreshHook(res.data);
      setNewHookUrl('');
      setNewHookEvents([]);
      await loadHooks();
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to create webhook'));
    } finally {
      setCreatingHook(false);
    }
  };

  const handleTestHook = async (id: number) => {
    setTestingHookId(id);
    try {
      await developerService.testWebhook(id);
      await loadHooks();
      flash('Test event sent');
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to send test event'));
    } finally {
      setTestingHookId(null);
    }
  };

  const handleDeleteHook = async (id: number) => {
    if (!window.confirm('Delete this webhook endpoint?')) return;
    try {
      await developerService.deleteWebhook(id);
      await loadHooks();
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to delete webhook'));
    }
  };

  // ── Automation builder handlers ───────────────────────────────────────
  const openBuilder = () => {
    setBuilder({
      name: '',
      trigger_event: meta.triggers[0] ?? '',
      conditions: [],
      actions: [{ type: (meta.actions[0] as AutomationAction['type']) ?? 'notify_managers', config: {} }],
      is_active: true,
    });
    setShowBuilder(true);
  };

  const addCondition = () =>
    setBuilder((b) => ({ ...b, conditions: [...b.conditions, { field: '', op: '==', value: '' }] }));

  const updateCondition = (i: number, patch: Partial<AutomationCondition>) =>
    setBuilder((b) => ({
      ...b,
      conditions: b.conditions.map((c, idx) => (idx === i ? { ...c, ...patch } : c)),
    }));

  const removeCondition = (i: number) =>
    setBuilder((b) => ({ ...b, conditions: b.conditions.filter((_, idx) => idx !== i) }));

  const addAction = () =>
    setBuilder((b) => ({
      ...b,
      actions: [...b.actions, { type: (meta.actions[0] as AutomationAction['type']) ?? 'notify_managers', config: {} }],
    }));

  const updateAction = (i: number, patch: Partial<AutomationAction>) =>
    setBuilder((b) => ({ ...b, actions: b.actions.map((a, idx) => (idx === i ? { ...a, ...patch } : a)) }));

  const updateActionConfig = (i: number, key: string, value: string) =>
    setBuilder((b) => ({
      ...b,
      actions: b.actions.map((a, idx) => (idx === i ? { ...a, config: { ...a.config, [key]: value } } : a)),
    }));

  const removeAction = (i: number) =>
    setBuilder((b) => ({ ...b, actions: b.actions.filter((_, idx) => idx !== i) }));

  const handleSaveAutomation = async () => {
    if (!builder.trigger_event || builder.actions.length === 0) {
      setError('Choose a trigger and at least one action.');
      return;
    }
    setSavingAuto(true);
    setError(null);
    try {
      await developerService.createAutomation({
        name: builder.name.trim() || 'Automation',
        trigger_event: builder.trigger_event,
        conditions: builder.conditions.filter((c) => c.field.trim() !== ''),
        actions: builder.actions,
        is_active: builder.is_active,
      });
      setShowBuilder(false);
      await loadAutomations();
      flash('Automation created');
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to save automation'));
    } finally {
      setSavingAuto(false);
    }
  };

  const toggleAutomation = async (a: Automation) => {
    try {
      await developerService.updateAutomation(a.id, { is_active: !a.is_active });
      await loadAutomations();
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to update automation'));
    }
  };

  const handleDeleteAutomation = async (id: number) => {
    if (!window.confirm('Delete this automation?')) return;
    try {
      await developerService.deleteAutomation(id);
      await loadAutomations();
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to delete automation'));
    }
  };

  const inputClass =
    'w-full h-11 bg-[#12141C] border border-white/10 rounded-xl px-4 text-white text-sm focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500/50 outline-none transition-all';

  const sections: { id: Section; label: string; icon: typeof KeyRound }[] = [
    { id: 'api-keys', label: 'API Keys', icon: KeyRound },
    { id: 'webhooks', label: 'Webhooks', icon: Webhook },
    { id: 'automations', label: 'Automations', icon: Zap },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-xl font-bold text-white mb-1">Developer Platform</h3>
        <p className="text-sm text-slate-400">
          Build on FlowTrack: mint API keys, receive signed webhooks, and automate cross-tool workflows.
        </p>
      </div>

      {error && <p className="text-rose-400 text-sm bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-3">{error}</p>}
      {success && <p className="text-emerald-400 text-sm bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-3">{success}</p>}

      <div className="flex flex-wrap gap-2 border-b border-white/10 pb-4">
        {sections.map((s) => {
          const Icon = s.icon;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setSection(s.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                section === s.id
                  ? 'bg-primary-500/10 text-primary-400 border border-primary-500/20 shadow-ai'
                  : 'text-slate-400 hover:text-white hover:bg-white/5 border border-transparent'
              }`}
            >
              <Icon size={16} />
              {s.label}
            </button>
          );
        })}
      </div>

      {/* ── API KEYS ─────────────────────────────────────────────────── */}
      {section === 'api-keys' && (
        <div className="space-y-5">
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              placeholder="Key name (e.g. Zapier, CI pipeline)"
              className={inputClass}
            />
            <button
              onClick={handleCreateKey}
              disabled={creatingKey}
              className="flex items-center justify-center gap-2 bg-ai-gradient text-white px-6 py-2.5 rounded-xl font-bold shadow-ai disabled:opacity-50 whitespace-nowrap"
            >
              {creatingKey ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />}
              Create key
            </button>
          </div>

          {freshKey && (
            <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 space-y-3">
              <p className="text-sm text-emerald-300 font-semibold">
                Copy your new key now — it will not be shown again.
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-sm text-white bg-[#0d0f16] rounded-lg px-3 py-2 break-all">{freshKey.plaintext}</code>
                <button onClick={copyKey} className="p-2.5 rounded-lg bg-white/10 hover:bg-white/20 text-white">
                  {copied ? <Check size={16} /> : <Copy size={16} />}
                </button>
              </div>
              <button onClick={() => setFreshKey(null)} className="text-xs text-slate-400 hover:text-white">Done</button>
            </div>
          )}

          {keysLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="animate-spin text-primary-500" /></div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-white/10">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-white/5 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3">Key</th>
                    <th className="px-4 py-3">Last used</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {keys.map((k) => (
                    <tr key={k.id} className="hover:bg-white/[0.02]">
                      <td className="px-4 py-3 text-sm text-white font-medium">{k.name}</td>
                      <td className="px-4 py-3 text-sm text-slate-400 font-mono">{k.masked}</td>
                      <td className="px-4 py-3 text-sm text-slate-400">{k.last_used_at ? new Date(k.last_used_at).toLocaleString() : 'Never'}</td>
                      <td className="px-4 py-3 text-sm">
                        <span className={k.is_active ? 'text-emerald-400' : 'text-slate-500'}>{k.is_active ? 'Active' : 'Revoked'}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {k.is_active && (
                          <button onClick={() => handleRevokeKey(k.id)} className="text-xs text-rose-400 hover:underline">Revoke</button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {keys.length === 0 && (
                    <tr><td colSpan={5} className="px-4 py-12 text-center text-slate-500 text-sm">No API keys yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          <div className="text-xs text-slate-500 bg-white/5 rounded-xl p-4 space-y-1">
            <p className="font-semibold text-slate-400">Using the public API</p>
            <p>Send your key in the <code className="text-primary-400">X-Api-Key</code> header (or <code className="text-primary-400">Authorization: Bearer …</code>).</p>
            <p>Endpoints: <code className="text-primary-400">GET /api/v1/public/ping</code>, <code className="text-primary-400">/public/projects</code>, <code className="text-primary-400">/public/time-entries</code>.</p>
          </div>
        </div>
      )}

      {/* ── WEBHOOKS ─────────────────────────────────────────────────── */}
      {section === 'webhooks' && (
        <div className="space-y-5">
          <div className="space-y-3 p-4 rounded-2xl bg-white/5 border border-white/10">
            <input
              value={newHookUrl}
              onChange={(e) => setNewHookUrl(e.target.value)}
              placeholder="https://example.com/webhooks/flowtrack"
              className={inputClass}
            />
            <div className="flex flex-wrap gap-2">
              {hookEvents.map((ev) => (
                <button
                  key={ev}
                  type="button"
                  onClick={() => toggleNewHookEvent(ev)}
                  className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                    newHookEvents.includes(ev)
                      ? 'bg-primary-500/20 text-primary-300 border-primary-500/40'
                      : 'bg-white/5 text-slate-400 border-white/10 hover:text-white'
                  }`}
                >
                  {ev}
                </button>
              ))}
            </div>
            <p className="text-xs text-slate-500">Leave all unselected to receive every event.</p>
            <button
              onClick={handleCreateHook}
              disabled={creatingHook || !newHookUrl.trim()}
              className="flex items-center gap-2 bg-ai-gradient text-white px-6 py-2.5 rounded-xl font-bold shadow-ai disabled:opacity-50"
            >
              {creatingHook ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />}
              Add endpoint
            </button>
          </div>

          {freshHook && (
            <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 space-y-2">
              <p className="text-sm text-emerald-300 font-semibold">Signing secret (store securely — shown once):</p>
              <code className="block text-sm text-white bg-[#0d0f16] rounded-lg px-3 py-2 break-all">{freshHook.secret}</code>
              <p className="text-xs text-slate-400">Verify the <code className="text-primary-400">X-FlowTrack-Signature</code> header (HMAC-SHA256 of the raw body).</p>
              <button onClick={() => setFreshHook(null)} className="text-xs text-slate-400 hover:text-white">Done</button>
            </div>
          )}

          {hooksLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="animate-spin text-primary-500" /></div>
          ) : (
            <div className="space-y-2">
              {hooks.map((h) => (
                <div key={h.id} className="flex items-center justify-between gap-4 p-4 rounded-2xl bg-white/5 border border-white/10">
                  <div className="min-w-0">
                    <p className="text-white text-sm font-medium truncate">{h.url}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {(h.events ?? []).join(', ') || '*'} · secret {h.secret_hint}
                      {h.last_status != null && ` · last status ${h.last_status}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <button
                      onClick={() => handleTestHook(h.id)}
                      disabled={testingHookId === h.id}
                      className="flex items-center gap-1.5 text-xs text-primary-400 hover:underline disabled:opacity-50"
                    >
                      {testingHookId === h.id ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                      Test
                    </button>
                    <button onClick={() => handleDeleteHook(h.id)} className="text-slate-400 hover:text-rose-400"><Trash2 size={16} /></button>
                  </div>
                </div>
              ))}
              {hooks.length === 0 && <p className="text-slate-500 text-sm text-center py-8">No webhook endpoints yet.</p>}
            </div>
          )}
        </div>
      )}

      {/* ── AUTOMATIONS ──────────────────────────────────────────────── */}
      {section === 'automations' && (
        <div className="space-y-5">
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm text-slate-400">If a trigger fires and conditions match, run actions (Slack, webhook, notify managers).</p>
            <button onClick={openBuilder} className="flex items-center gap-2 bg-ai-gradient text-white px-5 py-2.5 rounded-xl font-bold shadow-ai whitespace-nowrap">
              <Plus size={18} /> New automation
            </button>
          </div>

          {autoLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="animate-spin text-primary-500" /></div>
          ) : (
            <div className="space-y-2">
              {automations.map((a) => (
                <div key={a.id} className="flex items-center justify-between gap-4 p-4 rounded-2xl bg-white/5 border border-white/10">
                  <div className="min-w-0">
                    <p className="text-white text-sm font-medium">{a.name}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      When <span className="text-primary-400">{humanize(a.trigger_event)}</span>
                      {a.conditions.length > 0 && ` · ${a.conditions.length} condition(s)`}
                      {` · ${a.actions.map((ac) => humanize(ac.type)).join(', ')}`}
                      {a.run_count ? ` · ran ${a.run_count}×` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <button
                      onClick={() => toggleAutomation(a)}
                      className={`text-xs font-semibold px-2.5 py-1 rounded-lg ${a.is_active ? 'text-emerald-400 bg-emerald-500/10' : 'text-slate-400 bg-white/5'}`}
                    >
                      {a.is_active ? 'Active' : 'Paused'}
                    </button>
                    <button onClick={() => handleDeleteAutomation(a.id)} className="text-slate-400 hover:text-rose-400"><Trash2 size={16} /></button>
                  </div>
                </div>
              ))}
              {automations.length === 0 && <p className="text-slate-500 text-sm text-center py-8">No automations yet.</p>}
            </div>
          )}
        </div>
      )}

      {/* ── Automation builder modal ─────────────────────────────────── */}
      {showBuilder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-lg glass border border-white/10 rounded-3xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-white">New automation</h3>
              <button onClick={() => setShowBuilder(false)} className="text-slate-500 hover:text-white"><X size={20} /></button>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Name</label>
              <input value={builder.name} onChange={(e) => setBuilder((b) => ({ ...b, name: e.target.value }))} placeholder="e.g. Ping Slack on overtime" className={inputClass} />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">When (trigger)</label>
              <select value={builder.trigger_event} onChange={(e) => setBuilder((b) => ({ ...b, trigger_event: e.target.value }))} className="form-select w-full">
                {meta.triggers.map((t) => <option key={t} value={t}>{humanize(t)}</option>)}
              </select>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Conditions (optional)</label>
                <button onClick={addCondition} className="text-xs text-primary-400 hover:underline flex items-center gap-1"><Plus size={12} /> Add</button>
              </div>
              {builder.conditions.map((c, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input value={c.field} onChange={(e) => updateCondition(i, { field: e.target.value })} placeholder="field (e.g. duration_minutes)" className="flex-1 h-10 bg-[#12141C] border border-white/10 rounded-lg px-3 text-white text-sm" />
                  <select value={c.op} onChange={(e) => updateCondition(i, { op: e.target.value as AutomationCondition['op'] })} className="form-select w-20">
                    {CONDITION_OPS.map((op) => <option key={op} value={op}>{op}</option>)}
                  </select>
                  <input value={String(c.value ?? '')} onChange={(e) => updateCondition(i, { value: e.target.value })} placeholder="value" className="w-24 h-10 bg-[#12141C] border border-white/10 rounded-lg px-3 text-white text-sm" />
                  <button onClick={() => removeCondition(i)} className="text-slate-500 hover:text-rose-400"><X size={16} /></button>
                </div>
              ))}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Then (actions)</label>
                <button onClick={addAction} className="text-xs text-primary-400 hover:underline flex items-center gap-1"><Plus size={12} /> Add</button>
              </div>
              {builder.actions.map((a, i) => (
                <div key={i} className="space-y-2 p-3 rounded-xl bg-white/5 border border-white/10">
                  <div className="flex items-center gap-2">
                    <select value={a.type} onChange={(e) => updateAction(i, { type: e.target.value as AutomationAction['type'] })} className="form-select flex-1">
                      {meta.actions.map((ac) => <option key={ac} value={ac}>{humanize(ac)}</option>)}
                    </select>
                    <button onClick={() => removeAction(i)} className="text-slate-500 hover:text-rose-400"><X size={16} /></button>
                  </div>
                  {a.type === 'webhook' && (
                    <input value={String(a.config.url ?? '')} onChange={(e) => updateActionConfig(i, 'url', e.target.value)} placeholder="https://…" className="w-full h-10 bg-[#12141C] border border-white/10 rounded-lg px-3 text-white text-sm" />
                  )}
                  {(a.type === 'slack_post' || a.type === 'notify_managers') && (
                    <input value={String(a.config.message ?? '')} onChange={(e) => updateActionConfig(i, 'message', e.target.value)} placeholder="Message (use {user_name}, {project_name}…)" className="w-full h-10 bg-[#12141C] border border-white/10 rounded-lg px-3 text-white text-sm" />
                  )}
                </div>
              ))}
            </div>

            <label className="flex items-center gap-2 text-sm text-slate-300">
              <input type="checkbox" checked={builder.is_active} onChange={(e) => setBuilder((b) => ({ ...b, is_active: e.target.checked }))} />
              Active
            </label>

            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setShowBuilder(false)} className="px-4 py-2 rounded-xl text-sm text-slate-400 hover:text-white bg-white/5 hover:bg-white/10">Cancel</button>
              <button onClick={handleSaveAutomation} disabled={savingAuto} className="flex items-center gap-2 px-6 py-2 rounded-xl text-sm font-bold bg-ai-gradient text-white disabled:opacity-50">
                {savingAuto ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} />}
                Save automation
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DeveloperSettings;
