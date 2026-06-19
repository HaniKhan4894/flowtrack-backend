import { useState, useEffect } from 'react';
import { Loader2, Trash2, Sparkles } from 'lucide-react';
import { smartNotificationService, type SmartNotificationRule, type SmartNotificationTemplate } from '../../api/smartNotificationService';
import { getApiErrorMessage } from '../../utils/apiError';

export function SmartNotificationsSettingsTab() {
  const [loading, setLoading] = useState(true);
  const [rules, setRules] = useState<SmartNotificationRule[]>([]);
  const [templates, setTemplates] = useState<SmartNotificationTemplate[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [rulesRes, templatesRes] = await Promise.all([
        smartNotificationService.list(),
        smartNotificationService.templates(),
      ]);
      setRules(rulesRes.data ?? []);
      setTemplates(templatesRes.data ?? []);
    } catch (e: unknown) {
      setError(getApiErrorMessage(e, 'Failed to load smart notifications'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const addFromTemplate = async (template: SmartNotificationTemplate) => {
    setBusyId(-1);
    setError(null);
    try {
      await smartNotificationService.create({
        name: template.name,
        rule_type: template.rule_type,
        frequency: template.frequency as SmartNotificationRule['frequency'],
        channels: template.channels,
        threshold: template.threshold,
        is_active: true,
      });
      await load();
    } catch (e: unknown) {
      setError(getApiErrorMessage(e, 'Failed to create rule'));
    } finally {
      setBusyId(null);
    }
  };

  const toggleRule = async (rule: SmartNotificationRule) => {
    setBusyId(rule.id);
    try {
      await smartNotificationService.update(rule.id, { is_active: !rule.is_active });
      await load();
    } catch (e: unknown) {
      setError(getApiErrorMessage(e, 'Failed to update rule'));
    } finally {
      setBusyId(null);
    }
  };

  const deleteRule = async (rule: SmartNotificationRule) => {
    if (!window.confirm(`Delete "${rule.name}"?`)) return;
    setBusyId(rule.id);
    try {
      await smartNotificationService.delete(rule.id);
      await load();
    } catch (e: unknown) {
      setError(getApiErrorMessage(e, 'Failed to delete rule'));
    } finally {
      setBusyId(null);
    }
  };

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="animate-spin text-primary-500" /></div>;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-xl font-bold text-white mb-1">Smart Notifications</h3>
        <p className="text-sm text-slate-400">Rule-based alerts for suspicious activity, overworking, underworking, and more.</p>
      </div>
      {error && <p className="text-sm text-rose-400">{error}</p>}

      <div>
        <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Recommended notifications</p>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {templates.map((t) => (
            <button
              key={t.rule_type}
              type="button"
              onClick={() => addFromTemplate(t)}
              disabled={busyId === -1}
              className="text-left rounded-2xl border border-white/10 bg-white/[0.03] p-4 hover:border-primary-500/40 transition-colors"
            >
              <div className="flex items-center gap-2 mb-2"><Sparkles size={14} className="text-primary-400" /><span className="font-semibold text-white text-sm">{t.name}</span></div>
              <p className="text-xs text-slate-500 capitalize">{t.frequency} · {t.channels.join(', ')}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-white/10">
        <table className="w-full text-left min-w-[640px]">
          <thead>
            <tr className="border-b border-white/5 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
              <th className="px-4 py-3">Active</th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Frequency</th>
              <th className="px-4 py-3">Channels</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {rules.map((rule) => (
              <tr key={rule.id} className="hover:bg-white/[0.02]">
                <td className="px-4 py-3">
                  <input type="checkbox" checked={rule.is_active} disabled={busyId === rule.id} onChange={() => toggleRule(rule)} />
                </td>
                <td className="px-4 py-3 text-sm text-white font-medium">{rule.name}</td>
                <td className="px-4 py-3 text-xs text-slate-400">{rule.rule_type}</td>
                <td className="px-4 py-3 text-xs text-slate-400 capitalize">{rule.frequency}</td>
                <td className="px-4 py-3 text-xs text-slate-400">{(rule.channels ?? []).join(', ')}</td>
                <td className="px-4 py-3 text-right">
                  <button type="button" onClick={() => deleteRule(rule)} className="text-rose-400 hover:text-rose-300"><Trash2 size={14} /></button>
                </td>
              </tr>
            ))}
            {rules.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-500 text-sm">No smart notification rules yet. Add a recommended template above.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
