import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { CalendarDays, Plus, CheckCircle2, XCircle, Clock, Loader2 } from 'lucide-react';
import { Button, Input } from '../../components/ui';
import { leaveService, type LeaveBalance, type LeaveRequest, type LeaveType } from '../../api/leaveService';
import { useAuthStore } from '../../store/authStore';
import { hasPermission } from '../../utils/access';
import { getApiErrorMessage } from '../../utils/apiError';

const statusColor = (status: string) => {
  switch (status) {
    case 'approved': return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
    case 'rejected': return 'text-rose-400 bg-rose-500/10 border-rose-500/20';
    case 'cancelled': return 'text-slate-400 bg-white/5 border-white/10';
    default: return 'text-amber-400 bg-amber-500/10 border-amber-500/20';
  }
};

const LeavePage = () => {
  const { user } = useAuthStore();
  const canReview = hasPermission(user, 'users.edit');
  const [types, setTypes] = useState<LeaveType[]>([]);
  const [balances, setBalances] = useState<LeaveBalance[]>([]);
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ leave_type_id: '', start_date: '', end_date: '', reason: '' });

  const load = async () => {
    setLoading(true);
    try {
      const [typesResp, balancesResp, requestsResp] = await Promise.all([
        leaveService.getTypes(),
        leaveService.getBalances({ year: new Date().getFullYear() }),
        leaveService.getRequests(),
      ]);
      setTypes(typesResp.data ?? []);
      setBalances(balancesResp.data ?? []);
      setRequests(requestsResp.data ?? []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await leaveService.requestLeave({
        leave_type_id: Number(form.leave_type_id),
        start_date: form.start_date,
        end_date: form.end_date,
        reason: form.reason || undefined,
      });
      setShowForm(false);
      setForm({ leave_type_id: '', start_date: '', end_date: '', reason: '' });
      load();
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to submit request'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleReview = async (id: number, status: 'approved' | 'rejected') => {
    try {
      await leaveService.reviewRequest(id, { status });
      load();
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to review request'));
    }
  };

  const myBalances = balances.filter((b) => b.user_id === user?.id);
  const displayRequests = canReview ? requests : requests.filter((r) => r.user_id === user?.id);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-8 h-8 text-primary-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-12">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Leave & PTO</h1>
          <p className="text-slate-400">Request time off and track your leave balances.</p>
        </div>
        <Button className="w-fit" onClick={() => setShowForm(true)}>
          <Plus size={18} className="mr-2" /> Request Leave
        </Button>
      </div>

      {error && <p className="text-rose-400 text-sm">{error}</p>}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {myBalances.map((bal) => (
          <motion.div key={bal.id} className="overlay-panel p-5">
            <p className="text-xs text-slate-500 uppercase font-bold mb-1">{bal.leave_type_name}</p>
            <p className="text-2xl font-bold text-white">{bal.balance_days - bal.used_days} <span className="text-sm text-slate-400">days left</span></p>
            <p className="text-xs text-slate-500 mt-1">{bal.used_days} used of {bal.balance_days}</p>
          </motion.div>
        ))}
        {myBalances.length === 0 && (
          <div className="overlay-panel p-5 col-span-full text-slate-500 text-sm">No leave balances configured yet.</div>
        )}
      </div>

      <div className="overlay-panel overflow-x-auto">
        <h2 className="text-lg font-bold text-white p-4 border-b border-white/10 flex items-center gap-2">
          <CalendarDays size={20} className="text-primary-400" />
          {canReview ? 'Team Leave Requests' : 'My Requests'}
        </h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500 uppercase border-b border-white/10">
              {canReview && <th className="p-4">Member</th>}
              <th className="p-4">Type</th>
              <th className="p-4">Dates</th>
              <th className="p-4">Days</th>
              <th className="p-4">Status</th>
              <th className="p-4">Actions</th>
            </tr>
          </thead>
          <tbody>
            {displayRequests.map((req) => (
              <tr key={req.id} className="border-b border-white/5 hover:bg-white/5">
                {canReview && (
                  <td className="p-4 text-white font-medium">{req.first_name} {req.last_name}</td>
                )}
                <td className="p-4 text-slate-300">{req.leave_type_name}</td>
                <td className="p-4 text-slate-300">{req.start_date} — {req.end_date}</td>
                <td className="p-4 text-slate-300">{req.days_requested}</td>
                <td className="p-4">
                  <span className={`text-xs font-bold uppercase px-2 py-1 rounded-full border ${statusColor(req.status)}`}>
                    {req.status}
                  </span>
                </td>
                <td className="p-4">
                  {canReview && req.status === 'pending' && (
                    <div className="flex gap-2">
                      <button onClick={() => handleReview(req.id, 'approved')} className="text-emerald-400 hover:underline text-xs flex items-center gap-1">
                        <CheckCircle2 size={12} /> Approve
                      </button>
                      <button onClick={() => handleReview(req.id, 'rejected')} className="text-rose-400 hover:underline text-xs flex items-center gap-1">
                        <XCircle size={12} /> Reject
                      </button>
                    </div>
                  )}
                  {!canReview && req.status === 'pending' && (
                    <button onClick={() => leaveService.cancelRequest(req.id).then(load)} className="text-xs text-slate-400 hover:underline">
                      Cancel
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {displayRequests.length === 0 && (
              <tr><td colSpan={canReview ? 6 : 5} className="p-8 text-center text-slate-500">No leave requests yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="modal-panel w-full max-w-md p-6 space-y-4">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Clock size={18} /> Request Leave
            </h3>
            <form onSubmit={handleRequest} className="space-y-4">
              <select className="form-select" required value={form.leave_type_id} onChange={(e) => setForm((p) => ({ ...p, leave_type_id: e.target.value }))}>
                <option value="">Select leave type</option>
                {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <Input type="date" required value={form.start_date} onChange={(e) => setForm((p) => ({ ...p, start_date: e.target.value }))} />
              <Input type="date" required value={form.end_date} onChange={(e) => setForm((p) => ({ ...p, end_date: e.target.value }))} />
              <textarea value={form.reason} onChange={(e) => setForm((p) => ({ ...p, reason: e.target.value }))} placeholder="Reason (optional)" className="w-full h-20 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white resize-none" />
              <div className="flex gap-3">
                <Button variant="secondary" type="button" className="flex-1" onClick={() => setShowForm(false)}>Cancel</Button>
                <Button type="submit" className="flex-1" isLoading={submitting}>Submit</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default LeavePage;
