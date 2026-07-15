import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Plus, DollarSign, Loader2, Download, FileText } from 'lucide-react';
import { Button, Modal } from '../../components/ui';
import { payrollService } from '../../api/payrollService';
import { useAuthStore } from '../../store/authStore';
import { hasPermission } from '../../utils/access';
import { getApiErrorMessage } from '../../utils/apiError';
import type { PayrollItem, PayrollRun } from '../../types';

const formatMoney = (amount: number, currency = 'USD') =>
  new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount);

const formatHours = (seconds: number) => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
};

const PayrollRunDetailPage = () => {
  const { runId } = useParams<{ runId: string }>();
  const { user } = useAuthStore();
  const canManage = hasPermission(user, 'payroll.manage');
  const canPay = hasPermission(user, 'payroll.pay');
  const canExport = hasPermission(user, 'payroll.export');

  const [run, setRun] = useState<PayrollRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [finalizing, setFinalizing] = useState(false);
  const [adjustItem, setAdjustItem] = useState<PayrollItem | null>(null);
  const [payItem, setPayItem] = useState<PayrollItem | null>(null);
  const [adjustForm, setAdjustForm] = useState({ type: 'bonus' as 'bonus' | 'deduction', label: '', amount: '' });
  const [payForm, setPayForm] = useState({ amount: '', method: 'manual', reference: '' });
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    if (!runId) return;
    setLoading(true);
    try {
      const resp = await payrollService.getRun(Number(runId));
      setRun(resp.data);
    } catch (e) {
      setError(getApiErrorMessage(e, 'Failed to load payroll run'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [runId]);

  const handleFinalize = async () => {
    if (!run) return;
    setFinalizing(true);
    try {
      const resp = await payrollService.finalizeRun(run.id);
      setRun(resp.data);
    } catch (e) {
      setError(getApiErrorMessage(e, 'Failed to finalize'));
    } finally {
      setFinalizing(false);
    }
  };

  const handleAddAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustItem) return;
    setSubmitting(true);
    try {
      const resp = await payrollService.addAdjustment(adjustItem.id, {
        type: adjustForm.type,
        label: adjustForm.label,
        amount: parseFloat(adjustForm.amount),
      });
      setRun(resp.data);
      setAdjustItem(null);
      setAdjustForm({ type: 'bonus', label: '', amount: '' });
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to add adjustment'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payItem) return;
    setSubmitting(true);
    try {
      const resp = await payrollService.recordPayment(payItem.id, {
        amount: parseFloat(payForm.amount),
        method: payForm.method,
        reference: payForm.reference || undefined,
      });
      setRun(resp.data);
      setPayItem(null);
      setPayForm({ amount: '', method: 'manual', reference: '' });
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to record payment'));
    } finally {
      setSubmitting(false);
    }
  };

  const itemStatusColor = (status: string) => {
    switch (status) {
      case 'paid': return 'text-emerald-400';
      case 'partial': return 'text-amber-400';
      default: return 'text-slate-400';
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-8 h-8 text-primary-500 animate-spin" />
      </div>
    );
  }

  if (!run) {
    return <p className="text-rose-400">Payroll run not found.</p>;
  }

  const currency = run.currency ?? 'USD';
  const isDraft = run.status === 'draft';

  return (
    <div className="space-y-8 pb-12">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <Link to="/payroll" className="text-sm text-primary-400 hover:underline flex items-center gap-1 mb-2">
            <ArrowLeft size={14} /> Back to Payroll
          </Link>
          <h1 className="text-3xl font-bold text-white">{run.title}</h1>
          <p className="text-slate-400">{run.period_start} — {run.period_end}</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs font-bold uppercase px-3 py-1.5 rounded-full border text-primary-400 bg-primary-500/10 border-primary-500/20">
            {run.status.replace('_', ' ')}
          </span>
          {canExport && (
            <Button variant="secondary" onClick={() => payrollService.exportRunCsv(run.id, `payroll-${run.title.replace(/\s+/g, '-')}.csv`)}>
              <Download size={16} className="mr-2" /> Export CSV
            </Button>
          )}
          {canManage && isDraft && (
            <Button onClick={handleFinalize} isLoading={finalizing}>
              <CheckCircle2 size={16} className="mr-2" />
              Finalize Run
            </Button>
          )}
        </div>
      </div>

      {error && <p className="text-rose-400 text-sm">{error}</p>}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="overlay-panel p-5">
          <p className="text-xs text-slate-500 uppercase font-bold mb-1">Total Gross</p>
          <p className="text-2xl font-bold text-white">{formatMoney(run.total_gross, currency)}</p>
        </div>
        <div className="overlay-panel p-5">
          <p className="text-xs text-slate-500 uppercase font-bold mb-1">Total Paid</p>
          <p className="text-2xl font-bold text-emerald-400">{formatMoney(run.total_paid, currency)}</p>
        </div>
        <div className="overlay-panel p-5">
          <p className="text-xs text-slate-500 uppercase font-bold mb-1">Pending</p>
          <p className="text-2xl font-bold text-amber-400">{formatMoney(run.total_gross - run.total_paid, currency)}</p>
        </div>
      </div>

      <div className="overlay-panel overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500 uppercase border-b border-white/10">
              <th className="p-4">Member</th>
              <th className="p-4">Type</th>
              <th className="p-4">Hours</th>
              <th className="p-4">Base</th>
              <th className="p-4">Bonus</th>
              <th className="p-4">Deduction</th>
              <th className="p-4">Gross</th>
              <th className="p-4">Paid</th>
              <th className="p-4">Status</th>
              <th className="p-4">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(run.items ?? []).map((item) => (
              <tr key={item.id} className="border-b border-white/5 hover:bg-white/5">
                <td className="p-4">
                  <p className="font-semibold text-white">{item.first_name} {item.last_name}</p>
                  <p className="text-xs text-slate-500">{item.email}</p>
                </td>
                <td className="p-4 text-slate-300 capitalize">{item.pay_type}</td>
                <td className="p-4 text-slate-300">{formatHours(item.tracked_seconds)}</td>
                <td className="p-4 text-white">{formatMoney(item.base_amount, currency)}</td>
                <td className="p-4 text-emerald-400">+{formatMoney(item.bonus_total, currency)}</td>
                <td className="p-4 text-rose-400">-{formatMoney(item.deduction_total, currency)}</td>
                <td className="p-4 font-bold text-white">{formatMoney(item.gross_amount, currency)}</td>
                <td className="p-4 text-emerald-400">{formatMoney(item.paid_amount, currency)}</td>
                <td className={`p-4 font-bold capitalize ${itemStatusColor(item.status)}`}>{item.status}</td>
                <td className="p-4">
                  <div className="flex gap-2 flex-wrap">
                    {canExport && (
                      <button
                        onClick={() => payrollService.downloadPayslip(item.id, `payslip-${item.first_name}-${item.last_name}.pdf`)}
                        className="text-xs text-slate-300 hover:underline"
                      >
                        <FileText size={12} className="inline mr-1" />Payslip
                      </button>
                    )}
                    {canManage && isDraft && (
                      <button
                        onClick={() => setAdjustItem(item)}
                        className="text-xs text-primary-400 hover:underline"
                      >
                        <Plus size={12} className="inline mr-1" />Adjust
                      </button>
                    )}
                    {canPay && !isDraft && item.status !== 'paid' && (
                      <button
                        onClick={() => {
                          setPayItem(item);
                          setPayForm({
                            amount: String(item.gross_amount - item.paid_amount),
                            method: 'manual',
                            reference: '',
                          });
                        }}
                        className="text-xs text-emerald-400 hover:underline"
                      >
                        <DollarSign size={12} className="inline mr-1" />Pay
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Payment history */}
      {(run.items ?? []).some((i) => (i.payments?.length ?? 0) > 0) && (
        <div className="overlay-panel p-6">
          <h3 className="text-lg font-bold text-white mb-4">Payment Records</h3>
          <div className="space-y-3">
            {(run.items ?? []).flatMap((item) =>
              (item.payments ?? []).map((p) => (
                <div key={p.id} className="flex items-center justify-between p-3 rounded-xl bg-white/5">
                  <div>
                    <p className="text-white font-semibold">{item.first_name} {item.last_name}</p>
                    <p className="text-xs text-slate-500">{p.method} {p.reference ? `— ${p.reference}` : ''}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-emerald-400 font-bold">{formatMoney(p.amount, currency)}</p>
                    <p className="text-xs text-slate-500">{new Date(p.paid_at).toLocaleString()}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      <Modal
        open={!!adjustItem}
        onClose={() => setAdjustItem(null)}
        title={adjustItem ? `Add Adjustment — ${adjustItem.first_name}` : 'Add Adjustment'}
        size="sm"
      >
        <form onSubmit={handleAddAdjustment} className="space-y-4">
          <select
            className="form-select"
            value={adjustForm.type}
            onChange={(e) => setAdjustForm((p) => ({ ...p, type: e.target.value as 'bonus' | 'deduction' }))}
          >
            <option value="bonus">Bonus</option>
            <option value="deduction">Deduction</option>
          </select>
          <input
            required
            placeholder="Label (e.g. Performance bonus)"
            className="w-full h-12 bg-[#12141C] border border-white/10 rounded-xl px-4 text-white"
            value={adjustForm.label}
            onChange={(e) => setAdjustForm((p) => ({ ...p, label: e.target.value }))}
          />
          <input
            required
            type="number"
            step="0.01"
            placeholder="Amount"
            className="w-full h-12 bg-[#12141C] border border-white/10 rounded-xl px-4 text-white"
            value={adjustForm.amount}
            onChange={(e) => setAdjustForm((p) => ({ ...p, amount: e.target.value }))}
          />
          <Button type="submit" isLoading={submitting} className="w-full">Add</Button>
        </form>
      </Modal>

      <Modal
        open={!!payItem}
        onClose={() => setPayItem(null)}
        title={payItem ? `Record Payment — ${payItem.first_name}` : 'Record Payment'}
        size="sm"
      >
        <form onSubmit={handleRecordPayment} className="space-y-4">
          <input
            required
            type="number"
            step="0.01"
            placeholder="Amount"
            className="w-full h-12 bg-[#12141C] border border-white/10 rounded-xl px-4 text-white"
            value={payForm.amount}
            onChange={(e) => setPayForm((p) => ({ ...p, amount: e.target.value }))}
          />
          <select
            className="form-select"
            value={payForm.method}
            onChange={(e) => setPayForm((p) => ({ ...p, method: e.target.value }))}
          >
            <option value="manual">Manual / Cash</option>
            <option value="bank">Bank Transfer</option>
            <option value="stripe">Stripe (future)</option>
          </select>
          <input
            placeholder="Reference / Transaction ID"
            className="w-full h-12 bg-[#12141C] border border-white/10 rounded-xl px-4 text-white"
            value={payForm.reference}
            onChange={(e) => setPayForm((p) => ({ ...p, reference: e.target.value }))}
          />
          <Button type="submit" isLoading={submitting} className="w-full">Record Payment</Button>
        </form>
      </Modal>
    </div>
  );
};

export default PayrollRunDetailPage;
