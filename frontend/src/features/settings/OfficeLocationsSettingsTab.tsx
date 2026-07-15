import { useState, useEffect } from 'react';
import { Plus, Loader2, Trash2, MapPin, Save } from 'lucide-react';
import { officeLocationService, type OfficeLocation } from '../../api/officeLocationService';
import { organizationService } from '../../api/organizationService';
import { getApiErrorMessage } from '../../utils/apiError';
import { Modal } from '../../components/ui';
import { DEFAULT_OFFICE } from './orgSettingsDefaults';

interface Props {
  organizationId: number;
}

export function OfficeLocationsSettingsTab({ organizationId }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [locations, setLocations] = useState<OfficeLocation[]>([]);
  const [autoDetect, setAutoDetect] = useState(DEFAULT_OFFICE.auto_detect_enabled);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ name: '', public_ip: '', router_mac: '', location_type: 'office' as 'office' | 'non_office' });

  const load = async () => {
    setLoading(true);
    try {
      const [locRes, orgRes] = await Promise.all([
        officeLocationService.list(),
        organizationService.get(organizationId),
      ]);
      setLocations(locRes.data ?? []);
      setAutoDetect(orgRes.data.settings?.office?.auto_detect_enabled ?? DEFAULT_OFFICE.auto_detect_enabled);
    } catch (e: unknown) {
      setError(getApiErrorMessage(e, 'Failed to load office locations'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [organizationId]);

  const saveAutoDetect = async (enabled: boolean) => {
    setAutoDetect(enabled);
    setSaving(true);
    try {
      await organizationService.update(organizationId, { settings: { office: { auto_detect_enabled: enabled } } });
      if (enabled) await officeLocationService.runAutoDetect();
      await load();
    } catch (e: unknown) {
      setError(getApiErrorMessage(e, 'Failed to save'));
    } finally {
      setSaving(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await officeLocationService.create(form);
      setShowModal(false);
      setForm({ name: '', public_ip: '', router_mac: '', location_type: 'office' });
      await load();
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, 'Failed to create location'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (loc: OfficeLocation) => {
    if (!window.confirm(`Delete "${loc.name}"?`)) return;
    try {
      await officeLocationService.delete(loc.id);
      await load();
    } catch (e: unknown) {
      setError(getApiErrorMessage(e, 'Failed to delete'));
    }
  };

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="animate-spin text-primary-500" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-xl font-bold text-white mb-1">Remote vs In-Office</h3>
          <p className="text-sm text-slate-400">Define office locations so productivity can be compared by where work happens.</p>
        </div>
        <button type="button" onClick={() => setShowModal(true)} className="flex items-center gap-2 bg-ai-gradient text-white px-4 py-2 rounded-xl font-bold text-sm">
          <Plus size={16} /> Create office location
        </button>
      </div>

      {error && <p className="text-sm text-rose-400">{error}</p>}

      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-white">Enable automatic detection</p>
          <p className="text-xs text-slate-500 mt-1">Auto-discover office locations when 3+ members share the same router MAC.</p>
        </div>
        <button type="button" role="switch" aria-checked={autoDetect} onClick={() => saveAutoDetect(!autoDetect)} disabled={saving} className={`relative w-11 h-6 rounded-full ${autoDetect ? 'bg-primary-500' : 'bg-white/10'}`}>
          <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${autoDetect ? 'translate-x-5' : ''}`} />
        </button>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-white/10">
        <table className="w-full text-left min-w-[720px]">
          <thead>
            <tr className="border-b border-white/5 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
              <th className="px-4 py-3">Location name</th>
              <th className="px-4 py-3">Public IP</th>
              <th className="px-4 py-3">Router MAC</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Last active</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {locations.map((loc) => (
              <tr key={loc.id} className="hover:bg-white/[0.02]">
                <td className="px-4 py-3 text-sm text-white font-medium flex items-center gap-2"><MapPin size={14} className="text-primary-400" />{loc.name}</td>
                <td className="px-4 py-3 text-xs text-slate-400 font-mono">{loc.public_ip || '—'}</td>
                <td className="px-4 py-3 text-xs text-slate-400 font-mono">{loc.router_mac || '—'}</td>
                <td className="px-4 py-3 text-xs text-slate-400 capitalize">{loc.location_type.replace('_', ' ')}</td>
                <td className="px-4 py-3 text-xs text-slate-500">{loc.last_active_at || '—'}</td>
                <td className="px-4 py-3 text-right">
                  <button type="button" onClick={() => handleDelete(loc)} className="text-rose-400 hover:text-rose-300"><Trash2 size={14} /></button>
                </td>
              </tr>
            ))}
            {locations.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-12 text-center text-slate-500 text-sm">No office locations yet. Add a location to get started.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal open={showModal} onClose={() => setShowModal(false)} title="Create office location" size="sm">
        <form onSubmit={handleCreate} className="space-y-4">
          <input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder="Location name" className="form-field" required />
          <input value={form.public_ip} onChange={(e) => setForm((p) => ({ ...p, public_ip: e.target.value }))} placeholder="Public IP address (optional)" className="form-field" />
          <input value={form.router_mac} onChange={(e) => setForm((p) => ({ ...p, router_mac: e.target.value }))} placeholder="Router MAC address (optional)" className="form-field" />
          <select value={form.location_type} onChange={(e) => setForm((p) => ({ ...p, location_type: e.target.value as 'office' | 'non_office' }))} className="form-select">
            <option value="office">Office</option>
            <option value="non_office">Non-office</option>
          </select>
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-slate-400">Cancel</button>
            <button type="submit" disabled={saving} className="flex items-center gap-2 px-5 py-2 rounded-xl font-bold bg-ai-gradient text-white disabled:opacity-50">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
