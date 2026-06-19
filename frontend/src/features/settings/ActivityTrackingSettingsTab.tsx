import { useState, useEffect } from 'react';
import { Save, Loader2, Camera, Activity, Clock, Timer } from 'lucide-react';
import { organizationService } from '../../api/organizationService';
import { getApiErrorMessage } from '../../utils/apiError';
import type { OrgTrackingSettings, Organization } from '../../types';
import { DEFAULT_TRACKING } from './orgSettingsDefaults';

interface Props {
  organizationId: number;
  onSaved?: () => void;
}

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative w-11 h-6 rounded-full transition-colors ${checked ? 'bg-primary-500' : 'bg-white/10'} ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
    >
      <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${checked ? 'translate-x-5' : ''}`} />
    </button>
  );
}

function Section({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 space-y-4">
      <div className="flex items-center gap-2">
        <Icon size={18} className="text-primary-400" />
        <h4 className="text-sm font-bold text-white uppercase tracking-widest">{title}</h4>
      </div>
      {children}
    </div>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-2 border-b border-white/5 last:border-0">
      <div>
        <p className="text-sm text-white font-medium">{label}</p>
        {hint && <p className="text-xs text-slate-500 mt-0.5">{hint}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export function ActivityTrackingSettingsTab({ organizationId, onSaved }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [tracking, setTracking] = useState<OrgTrackingSettings>(DEFAULT_TRACKING);
  const [planCaps, setPlanCaps] = useState<Organization['plan_caps']>();

  useEffect(() => {
    setLoading(true);
    organizationService.get(organizationId)
      .then((r) => {
        const org = r.data;
        setTracking({ ...DEFAULT_TRACKING, ...(org.settings?.tracking ?? {}) });
        setPlanCaps(org.plan_caps);
      })
      .catch(() => setError('Failed to load settings'))
      .finally(() => setLoading(false));
  }, [organizationId]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await organizationService.update(organizationId, { settings: { tracking } });
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
      onSaved?.();
    } catch (e: unknown) {
      setError(getApiErrorMessage(e, 'Failed to save tracking settings'));
    } finally {
      setSaving(false);
    }
  };

  const minInterval = planCaps?.screenshot_interval_min ?? 0;

  if (loading) {
    return <div className="flex justify-center py-16"><Loader2 className="animate-spin text-primary-500" /></div>;
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h3 className="text-xl font-bold text-white mb-1">Activity &amp; Tracking</h3>
        <p className="text-sm text-slate-400">Organization-wide defaults for screenshots, activity monitoring, idle time, and timer behavior.</p>
      </div>

      {error && <p className="text-sm text-rose-400">{error}</p>}
      {success && <p className="text-sm text-emerald-400">Settings saved.</p>}

      <Section title="Screenshots" icon={Camera}>
        <Row label="Enable screenshots" hint={!planCaps?.screenshots ? 'Not available on current plan' : undefined}>
          <Toggle checked={tracking.screenshot_enabled} onChange={(v) => setTracking((p) => ({ ...p, screenshot_enabled: v }))} disabled={!planCaps?.screenshots} />
        </Row>
        <Row label="Only while timer is on">
          <Toggle checked={tracking.screenshot_only_while_timer} onChange={(v) => setTracking((p) => ({ ...p, screenshot_only_while_timer: v }))} />
        </Row>
        <Row label={`Frequency (minutes)${minInterval > 0 ? ` — plan min ${minInterval}` : ''}`}>
          <input
            type="range"
            min={Math.max(1, minInterval || 1)}
            max={60}
            value={Math.max(tracking.screenshot_frequency_minutes, minInterval || 1)}
            onChange={(e) => setTracking((p) => ({ ...p, screenshot_frequency_minutes: Number(e.target.value) }))}
            className="w-40 accent-primary-500"
          />
          <span className="text-sm text-slate-300 ml-2 w-8 inline-block">{Math.max(tracking.screenshot_frequency_minutes, minInterval || 1)}m</span>
        </Row>
        <Row label="Quality">
          <select value={tracking.screenshot_quality} onChange={(e) => setTracking((p) => ({ ...p, screenshot_quality: e.target.value as OrgTrackingSettings['screenshot_quality'] }))} className="form-select text-sm">
            <option value="normal">Normal</option>
            <option value="high">High</option>
            <option value="very_high">Very high</option>
          </select>
        </Row>
        <Row label={`Retention (days)${planCaps?.data_retention_days ? ` — plan max ${planCaps.data_retention_days}` : ''}`}>
          <input
            type="number"
            min={7}
            max={planCaps?.data_retention_days ?? 365}
            value={tracking.screenshot_retention_days}
            onChange={(e) => setTracking((p) => ({ ...p, screenshot_retention_days: Number(e.target.value) }))}
            className="form-field w-24 text-sm"
          />
        </Row>
        <Row label="Hide screenshots from users">
          <Toggle checked={tracking.screenshot_hide_from_users} onChange={(v) => setTracking((p) => ({ ...p, screenshot_hide_from_users: v }))} />
        </Row>
        <Row label="Disallow deleting screenshots">
          <Toggle checked={tracking.screenshot_disallow_deleting} onChange={(v) => setTracking((p) => ({ ...p, screenshot_disallow_deleting: v }))} />
        </Row>
        <Row label="Suppress capture notifications">
          <Toggle checked={tracking.screenshot_suppress_notifications} onChange={(v) => setTracking((p) => ({ ...p, screenshot_suppress_notifications: v }))} />
        </Row>
      </Section>

      <Section title="Activity tracking" icon={Activity}>
        <Row label="Track app activity" hint={!planCaps?.activity_tracking ? 'Not available on current plan' : undefined}>
          <Toggle checked={tracking.activity_tracking_enabled} onChange={(v) => setTracking((p) => ({ ...p, activity_tracking_enabled: v }))} disabled={!planCaps?.activity_tracking} />
        </Row>
        <Row label="Track browser URLs">
          <Toggle checked={tracking.url_tracking_enabled} onChange={(v) => setTracking((p) => ({ ...p, url_tracking_enabled: v }))} />
        </Row>
        <Row label="Automated time tracking">
          <Toggle checked={tracking.automated_tracking} onChange={(v) => setTracking((p) => ({ ...p, automated_tracking: v }))} />
        </Row>
      </Section>

      <Section title="Idle time" icon={Clock}>
        <Row label="Idle timeout (minutes)">
          <input type="number" min={1} max={60} value={tracking.idle_timeout_minutes} onChange={(e) => setTracking((p) => ({ ...p, idle_timeout_minutes: Number(e.target.value) }))} className="form-field w-24 text-sm" />
        </Row>
        <Row label="Keep idle time">
          <select value={tracking.keep_idle_time} onChange={(e) => setTracking((p) => ({ ...p, keep_idle_time: e.target.value as OrgTrackingSettings['keep_idle_time'] }))} className="form-select text-sm">
            <option value="prompt">Prompt</option>
            <option value="always">Always</option>
            <option value="never">Never</option>
          </select>
        </Row>
      </Section>

      <Section title="Timer" icon={Timer}>
        <Row label="Timer tolerance (minutes)">
          <input type="number" min={1} max={30} value={tracking.timer_tolerance_minutes} onChange={(e) => setTracking((p) => ({ ...p, timer_tolerance_minutes: Number(e.target.value) }))} className="form-field w-24 text-sm" />
        </Row>
        <Row label="Timer reminder">
          <Toggle checked={tracking.timer_reminder_enabled} onChange={(v) => setTracking((p) => ({ ...p, timer_reminder_enabled: v }))} />
        </Row>
      </Section>

      <div className="flex justify-end">
        <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 bg-ai-gradient text-white px-8 py-3 rounded-xl font-bold disabled:opacity-50">
          {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
          Save tracking settings
        </button>
      </div>
    </div>
  );
}
