import { useState, useEffect } from 'react';
import { Save, Loader2, FileCheck } from 'lucide-react';
import { organizationService } from '../../api/organizationService';
import { getApiErrorMessage } from '../../utils/apiError';
import type { OrgTimesheetSettings } from '../../types';
import { DEFAULT_TIMESHEET } from './orgSettingsDefaults';

interface Props {
  organizationId: number;
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className={`relative w-11 h-6 rounded-full transition-colors ${checked ? 'bg-primary-500' : 'bg-white/10'}`}>
      <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${checked ? 'translate-x-5' : ''}`} />
    </button>
  );
}

export function TimesheetPolicySettingsTab({ organizationId }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [timesheet, setTimesheet] = useState<OrgTimesheetSettings>(DEFAULT_TIMESHEET);

  useEffect(() => {
    organizationService.get(organizationId)
      .then((r) => setTimesheet({ ...DEFAULT_TIMESHEET, ...(r.data.settings?.timesheet ?? {}) }))
      .catch(() => setError('Failed to load'))
      .finally(() => setLoading(false));
  }, [organizationId]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await organizationService.update(organizationId, { settings: { timesheet } });
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (e: unknown) {
      setError(getApiErrorMessage(e, 'Failed to save'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="animate-spin text-primary-500" /></div>;

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h3 className="text-xl font-bold text-white mb-1">Timesheet Policies</h3>
        <p className="text-sm text-slate-400">Organization defaults for timesheet approval, pay periods, and manual time edits.</p>
      </div>
      {error && <p className="text-sm text-rose-400">{error}</p>}
      {success && <p className="text-sm text-emerald-400">Saved.</p>}

      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 space-y-4">
        <div className="flex items-center gap-2 mb-2"><FileCheck size={18} className="text-primary-400" /><h4 className="text-sm font-bold text-white uppercase tracking-widest">Defaults</h4></div>
        <div className="flex items-center justify-between py-2 border-b border-white/5">
          <span className="text-sm text-white">Require timesheet approval</span>
          <Toggle checked={timesheet.require_approval} onChange={(v) => setTimesheet((p) => ({ ...p, require_approval: v }))} />
        </div>
        <div className="flex items-center justify-between py-2 border-b border-white/5">
          <span className="text-sm text-white">Pay period</span>
          <select value={timesheet.pay_period} onChange={(e) => setTimesheet((p) => ({ ...p, pay_period: e.target.value as OrgTimesheetSettings['pay_period'] }))} className="form-select text-sm">
            <option value="weekly">Weekly</option>
            <option value="biweekly">Biweekly</option>
            <option value="monthly">Monthly</option>
          </select>
        </div>
        <div className="flex items-center justify-between py-2 border-b border-white/5">
          <span className="text-sm text-white">Allow modify time (manual)</span>
          <Toggle checked={timesheet.allow_modify_time} onChange={(v) => setTimesheet((p) => ({ ...p, allow_modify_time: v }))} />
        </div>
        <div className="flex items-center justify-between py-2">
          <span className="text-sm text-white">Require reason when editing time</span>
          <Toggle checked={timesheet.require_reason_on_edit} onChange={(v) => setTimesheet((p) => ({ ...p, require_reason_on_edit: v }))} />
        </div>
      </div>

      <div className="flex justify-end">
        <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 bg-ai-gradient text-white px-8 py-3 rounded-xl font-bold disabled:opacity-50">
          {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
          Save timesheet policies
        </button>
      </div>
    </div>
  );
}
