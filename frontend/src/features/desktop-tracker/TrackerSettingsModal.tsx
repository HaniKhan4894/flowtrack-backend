import { useEffect, useState } from 'react';
import { Camera, Clock, Loader2, Save, Settings, Timer, X } from 'lucide-react';
import { ThemePreferencePicker } from '../../components/ThemeToggle';
import { useAuthStore } from '../../store/authStore';
import { monitoringSettingsService, type MemberMonitoringSettings } from '../../api/monitoringSettingsService';
import { hasPlanFeature } from '../../utils/access';
import { getApiErrorMessage } from '../../utils/apiError';
import { toastError, toastSuccess } from '../../store/toastStore';
import type { OrgTrackingSettings } from '../../types';
import { DEFAULT_TRACKING } from '../settings/orgSettingsDefaults';
import { cn } from '../../lib/cn';

type SettingsTab = 'general' | 'timer' | 'screenshots';

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative h-6 w-11 rounded-full transition-colors',
        checked ? 'bg-primary-500' : 'bg-white/10',
        disabled && 'cursor-not-allowed opacity-40',
      )}
    >
      <span className={cn('absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform', checked && 'translate-x-5')} />
    </button>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-white/5 py-3 last:border-0">
      <div className="min-w-0">
        <p className="text-sm text-white">{label}</p>
        {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

interface Props {
  open: boolean;
  onClose: () => void;
}

export function TrackerSettingsModal({ open, onClose }: Props) {
  const user = useAuthStore((s) => s.user);
  const orgTracking: OrgTrackingSettings = { ...DEFAULT_TRACKING, ...(user?.tracking_config ?? {}) };
  const hasScreenshotsPlan = hasPlanFeature(user, 'screenshots');

  const [tab, setTab] = useState<SettingsTab>('general');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [memberSettings, setMemberSettings] = useState<MemberMonitoringSettings | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    monitoringSettingsService
      .getMySettings()
      .then((r) => setMemberSettings(r.data))
      .catch(() => setMemberSettings(null))
      .finally(() => setLoading(false));
  }, [open]);

  const handleSave = async () => {
    if (!memberSettings) return;
    setSaving(true);
    try {
      const resp = await monitoringSettingsService.updateMySettings({
        tracking_enabled: memberSettings.tracking_enabled,
      });
      setMemberSettings(resp.data);
      toastSuccess('Settings saved');
      onClose();
    } catch (e) {
      toastError(getApiErrorMessage(e, 'Failed to save settings'));
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  const tabs: { id: SettingsTab; label: string; icon: React.ElementType }[] = [
    { id: 'general', label: 'General', icon: Settings },
    { id: 'timer', label: 'Timer', icon: Timer },
    { id: 'screenshots', label: 'Screenshots', icon: Camera },
  ];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#12141C] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <h2 className="text-lg font-bold text-white">Settings</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-white/5 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex border-b border-white/10 px-2">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                'flex flex-1 items-center justify-center gap-1.5 px-2 py-2.5 text-xs font-semibold',
                tab === t.id ? 'border-b-2 border-primary-500 text-primary-300' : 'text-slate-500',
              )}
            >
              <t.icon className="h-3.5 w-3.5" />
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3">
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
            </div>
          ) : (
            <>
              {tab === 'general' && memberSettings && (
                <div>
                  <div className="border-b border-white/5 py-3">
                    <p className="text-sm text-white">Color theme</p>
                    <p className="mt-0.5 text-xs text-slate-500">Applies immediately on this device.</p>
                    <div className="mt-3">
                      <ThemePreferencePicker className="w-full flex-wrap" />
                    </div>
                  </div>
                  <Row label="Time tracking" hint="Allow this device to track your work time.">
                    <Toggle
                      checked={memberSettings.tracking_enabled}
                      onChange={(v) => setMemberSettings((p) => (p ? { ...p, tracking_enabled: v } : p))}
                    />
                  </Row>
                  <Row label="Activity tracking" hint="Set by your organization admin.">
                    <span className="text-xs text-slate-400">{orgTracking.activity_tracking_enabled ? 'On' : 'Off'}</span>
                  </Row>
                  <Row label="URL tracking" hint="Set by your organization admin.">
                    <span className="text-xs text-slate-400">{orgTracking.url_tracking_enabled ? 'On' : 'Off'}</span>
                  </Row>
                </div>
              )}

              {tab === 'timer' && (
                <div>
                  <Row label="Idle timeout" hint="Admin default — timer pauses after inactivity.">
                    <span className="text-xs font-mono text-slate-300">{orgTracking.idle_timeout_minutes} min</span>
                  </Row>
                  <Row label="Keep idle time" hint="How idle periods are handled.">
                    <span className="text-xs capitalize text-slate-300">{orgTracking.keep_idle_time}</span>
                  </Row>
                  <Row label="Timer tolerance" hint="Grace period for daily hour targets.">
                    <span className="text-xs font-mono text-slate-300">{orgTracking.timer_tolerance_minutes} min</span>
                  </Row>
                  <Row label="Working-while-paused reminder" hint="Set by admin.">
                    <span className="text-xs text-slate-400">{orgTracking.timer_reminder_enabled ? 'On' : 'Off'}</span>
                  </Row>
                  <p className="mt-3 flex items-start gap-2 rounded-lg border border-white/5 bg-white/[0.02] p-3 text-xs text-slate-500">
                    <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    Timer rules are managed by your organization. Contact your admin to change defaults.
                  </p>
                </div>
              )}

              {tab === 'screenshots' && (
                <div>
                  {!hasScreenshotsPlan ? (
                    <p className="py-6 text-center text-sm text-slate-500">Screenshots are not included in your plan.</p>
                  ) : (
                    <>
                      <Row label="Screenshot capture" hint="Controlled by your organization admin.">
                        <span className="text-xs text-slate-400">{orgTracking.screenshot_enabled ? 'Enabled' : 'Disabled'}</span>
                      </Row>
                      <Row label="Capture frequency" hint="Random interval within each window.">
                        <span className="text-xs font-mono text-slate-300">{orgTracking.screenshot_frequency_minutes} min</span>
                      </Row>
                      <Row label="Only while timer is on">
                        <span className="text-xs text-slate-400">{orgTracking.screenshot_only_while_timer ? 'Yes' : 'No'}</span>
                      </Row>
                      <Row label="Suppress capture notifications" hint="No popup when a screenshot is taken.">
                        <span className="text-xs text-slate-400">{orgTracking.screenshot_suppress_notifications ? 'Yes' : 'No'}</span>
                      </Row>
                      <Row label="View screenshots" hint="Admin can hide the screenshots section from members.">
                        <span className="text-xs text-slate-400">
                          {orgTracking.screenshot_hide_from_users ? 'Hidden from members' : 'Visible to you'}
                        </span>
                      </Row>
                      {orgTracking.screenshot_hide_from_users && (
                        <p className="mt-2 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-200">
                          Your admin has hidden the screenshots section. Captures may still run for compliance.
                        </p>
                      )}
                    </>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        <div className="border-t border-white/10 px-4 py-3">
          <button
            type="button"
            disabled={saving || loading || !memberSettings}
            onClick={() => void handleSave()}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary-500/20 py-2.5 text-sm font-bold text-primary-200 hover:bg-primary-500/30 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save settings
          </button>
        </div>
      </div>
    </div>
  );
}
