import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Wallet, Plus, Users, DollarSign, CheckCircle2, Clock, Loader2 } from 'lucide-react';
import { Button, Modal } from '../../components/ui';
import { payrollService } from '../../api/payrollService';
import { teamService } from '../../api/teamService';
import { useAuthStore } from '../../store/authStore';
import { hasPermission } from '../../utils/access';
import { getApiErrorMessage } from '../../utils/apiError';
import type { PayrollCompensation, PayrollRun, PayrollSummary } from '../../types';

const formatMoney = (amount: number, currency = 'USD') =>
  new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount);

const PayrollPage = () => {
  const { user } = useAuthStore();
  const currency = user?.organization?.currency ?? 'USD';
  const canManage = hasPermission(user, 'payroll.manage');

  const [activeTab, setActiveTab] = useState<'runs' | 'compensation'>('runs');
  const [summary, setSummary] = useState<PayrollSummary | null>(null);
  const [runs, setRuns] = useState<PayrollRun[]>([]);
  const [compensations, setCompensations] = useState<PayrollCompensation[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateRun, setShowCreateRun] = useState(false);
  const [creating, setCreating] = useState(false);
  const [runForm, setRunForm] = useState({ title: '', period_start: '', period_end: '' });
  const [savingComp, setSavingComp] = useState<number | null>(null);
  const [compForms, setCompForms] = useState<Record<number, {
    pay_type: 'hourly' | 'fixed' | 'custom';
    hourly_rate: string;
    fixed_amount: string;
    notes: string;
  }>>({});

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [summaryResp, runsResp, compResp, teamResp] = await Promise.all([
        payrollService.getSummary(),
        payrollService.getRuns(),
        payrollService.getCompensations(),
        teamService.getAll(),
      ]);
      setSummary(summaryResp.data);
      setRuns(runsResp.data ?? []);
      setCompensations(compResp.data ?? []);
      setMembers(teamResp.data ?? []);

      const forms: typeof compForms = {};
      (teamResp.data ?? []).forEach((m: any) => {
        const existing = (compResp.data ?? []).find((c) => c.user_id === m.user_id);
        forms[m.user_id] = {
          pay_type: existing?.pay_type ?? 'hourly',
          hourly_rate: String(existing?.hourly_rate ?? m.hourly_rate ?? ''),
          fixed_amount: String(existing?.fixed_amount ?? ''),
          notes: existing?.notes ?? '',
        };
      });
      setCompForms(forms);
    } catch (e) {
      setError(getApiErrorMessage(e, 'Failed to load payroll'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleCreateRun = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      const resp = await payrollService.createRun({
        ...runForm,
        currency,
      });
      setShowCreateRun(false);
      setRunForm({ title: '', period_start: '', period_end: '' });
      await load();
      window.location.href = `/payroll/runs/${resp.data.id}`;
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to create payroll run'));
    } finally {
      setCreating(false);
    }
  };

  const handleSaveCompensation = async (userId: number) => {
    const form = compForms[userId];
    if (!form) return;
    setSavingComp(userId);
    try {
      await payrollService.upsertCompensation({
        user_id: userId,
        pay_type: form.pay_type,
        hourly_rate: form.hourly_rate ? parseFloat(form.hourly_rate) : null,
        fixed_amount: form.fixed_amount ? parseFloat(form.fixed_amount) : null,
        currency,
        notes: form.notes || undefined,
      });
      await load();
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to save compensation'));
    } finally {
      setSavingComp(null);
    }
  };

  const statusColor = (status: string) => {
    switch (status) {
      case 'paid': return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
      case 'partially_paid': return 'text-amber-400 bg-amber-500/10 border-amber-500/20';
      case 'finalized': return 'text-primary-400 bg-primary-500/10 border-primary-500/20';
      default: return 'text-slate-400 bg-white/5 border-white/10';
    }
  };

  return (
    <div className="space-y-8 pb-12">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2 flex items-center gap-2">
            <Wallet className="text-primary-400" />
            Team Payroll
          </h1>
          <p className="text-slate-400">Manage compensation, payroll runs, and payment records.</p>
        </div>
        {canManage && activeTab === 'runs' && (
          <Button onClick={() => setShowCreateRun(true)}>
            <Plus className="w-4 h-4 mr-2" />
            New Payroll Run
          </Button>
        )}
      </div>

      {error && <p className="text-rose-400 text-sm">{error}</p>}

      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[
            { label: 'Total Computed', value: formatMoney(summary.total_gross, currency), icon: DollarSign },
            { label: 'Total Paid', value: formatMoney(summary.total_paid, currency), icon: CheckCircle2 },
            { label: 'Pending', value: formatMoney(summary.total_pending, currency), icon: Clock },
            { label: 'Payroll Runs', value: String(summary.runs_count), icon: Wallet },
          ].map(({ label, value, icon: Icon }) => (
            <motion.div key={label} className="overlay-panel p-5">
              <div className="flex items-center gap-2 text-slate-500 text-xs font-bold uppercase mb-2">
                <Icon size={14} /> {label}
              </div>
              <p className="text-2xl font-bold text-white">{value}</p>
            </motion.div>
          ))}
        </div>
      )}

      <div className="flex gap-2 border-b border-white/10">
        {(['runs', 'compensation'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-6 py-3 text-sm font-bold capitalize border-b-2 -mb-px transition-all ${
              activeTab === tab ? 'text-primary-400 border-primary-500' : 'text-slate-500 border-transparent hover:text-white'
            }`}
          >
            {tab === 'runs' ? 'Payroll Runs' : 'Compensation'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-8 h-8 text-primary-500 animate-spin" />
        </div>
      ) : activeTab === 'runs' ? (
        <div className="space-y-4">
          {runs.length === 0 ? (
            <div className="overlay-panel flex flex-col items-center py-16 text-center">
              <Wallet className="w-12 h-12 text-slate-600 mb-4" />
              <p className="text-white font-bold mb-1">No payroll runs yet</p>
              <p className="text-slate-400 text-sm">Create a run to calculate salaries for your team.</p>
            </div>
          ) : (
            runs.map((run) => (
              <Link
                key={run.id}
                to={`/payroll/runs/${run.id}`}
                className="overlay-panel p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:border-primary-500/30 transition-all block"
              >
                <div>
                  <p className="font-bold text-white text-lg">{run.title}</p>
                  <p className="text-sm text-slate-400">{run.period_start} — {run.period_end}</p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="text-white font-bold">{formatMoney(run.total_gross, run.currency)}</p>
                    <p className="text-xs text-slate-500">Paid: {formatMoney(run.total_paid, run.currency)}</p>
                  </div>
                  <span className={`text-xs font-bold uppercase px-3 py-1 rounded-full border ${statusColor(run.status)}`}>
                    {run.status.replace('_', ' ')}
                  </span>
                </div>
              </Link>
            ))
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {members.map((member) => {
            const form = compForms[member.user_id];
            if (!form) return null;
            const existing = compensations.find((c) => c.user_id === member.user_id);
            return (
              <div key={member.user_id} className="overlay-panel p-5">
                <div className="flex items-center gap-3 mb-4">
                  <Users size={18} className="text-primary-400" />
                  <div>
                    <p className="font-bold text-white">{member.first_name} {member.last_name}</p>
                    <p className="text-xs text-slate-500">{member.email}</p>
                  </div>
                  {existing && (
                    <span className="ml-auto text-xs text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded-full">Configured</span>
                  )}
                </div>
                {canManage ? (
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div>
                      <label className="text-xs text-slate-500 uppercase font-bold">Pay Type</label>
                      <select
                        className="form-select mt-1"
                        value={form.pay_type}
                        onChange={(e) => setCompForms((p) => ({
                          ...p,
                          [member.user_id]: { ...form, pay_type: e.target.value as 'hourly' | 'fixed' | 'custom' },
                        }))}
                      >
                        <option value="hourly">Hourly</option>
                        <option value="fixed">Fixed Monthly</option>
                        <option value="custom">Custom</option>
                      </select>
                    </div>
                    {form.pay_type === 'hourly' && (
                      <div>
                        <label className="text-xs text-slate-500 uppercase font-bold">Hourly Rate ({currency})</label>
                        <input
                          type="number"
                          step="0.01"
                          className="w-full h-12 mt-1 bg-[#12141C] border border-white/10 rounded-xl px-4 text-white"
                          value={form.hourly_rate}
                          onChange={(e) => setCompForms((p) => ({
                            ...p,
                            [member.user_id]: { ...form, hourly_rate: e.target.value },
                          }))}
                        />
                      </div>
                    )}
                    {form.pay_type === 'fixed' && (
                      <div>
                        <label className="text-xs text-slate-500 uppercase font-bold">Fixed Amount ({currency})</label>
                        <input
                          type="number"
                          step="0.01"
                          className="w-full h-12 mt-1 bg-[#12141C] border border-white/10 rounded-xl px-4 text-white"
                          value={form.fixed_amount}
                          onChange={(e) => setCompForms((p) => ({
                            ...p,
                            [member.user_id]: { ...form, fixed_amount: e.target.value },
                          }))}
                        />
                      </div>
                    )}
                    <div className="md:col-span-2">
                      <label className="text-xs text-slate-500 uppercase font-bold">Notes</label>
                      <input
                        type="text"
                        className="w-full h-12 mt-1 bg-[#12141C] border border-white/10 rounded-xl px-4 text-white"
                        value={form.notes}
                        onChange={(e) => setCompForms((p) => ({
                          ...p,
                          [member.user_id]: { ...form, notes: e.target.value },
                        }))}
                      />
                    </div>
                    <div className="flex items-end">
                      <button
                        onClick={() => handleSaveCompensation(member.user_id)}
                        disabled={savingComp === member.user_id}
                        className="bg-ai-gradient text-white px-6 py-3 rounded-xl font-bold disabled:opacity-50"
                      >
                        {savingComp === member.user_id ? 'Saving...' : 'Save'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-slate-400">
                    {existing
                      ? `${existing.pay_type} — ${existing.pay_type === 'hourly' ? formatMoney(existing.hourly_rate ?? 0, currency) + '/hr' : formatMoney(existing.fixed_amount ?? 0, currency)}`
                      : 'Not configured'}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Modal open={showCreateRun} onClose={() => setShowCreateRun(false)} title="New Payroll Run" size="sm">
        <form onSubmit={handleCreateRun} className="space-y-4">
          <div>
            <label className="text-xs text-slate-500 uppercase font-bold">Title (optional)</label>
            <input
              className="w-full h-12 mt-1 bg-[#12141C] border border-white/10 rounded-xl px-4 text-white"
              value={runForm.title}
              onChange={(e) => setRunForm((p) => ({ ...p, title: e.target.value }))}
              placeholder="June 2026 Payroll"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-slate-500 uppercase font-bold">Period Start</label>
              <input
                type="date"
                required
                className="w-full h-12 mt-1 bg-[#12141C] border border-white/10 rounded-xl px-4 text-white"
                value={runForm.period_start}
                onChange={(e) => setRunForm((p) => ({ ...p, period_start: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs text-slate-500 uppercase font-bold">Period End</label>
              <input
                type="date"
                required
                className="w-full h-12 mt-1 bg-[#12141C] border border-white/10 rounded-xl px-4 text-white"
                value={runForm.period_end}
                onChange={(e) => setRunForm((p) => ({ ...p, period_end: e.target.value }))}
              />
            </div>
          </div>
          <Button type="submit" isLoading={creating} className="w-full">Create Run</Button>
        </form>
      </Modal>
    </div>
  );
};

export default PayrollPage;
