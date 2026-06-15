import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { CheckCircle2, CreditCard, FileText, Loader2 } from 'lucide-react';
import { clientPortalService, type PortalInvoice } from '../../api/clientPortalService';
import { Button } from '../../components/ui';
import { getApiErrorMessage } from '../../utils/apiError';

const ClientPortalPage = () => {
  const { token } = useParams<{ token: string }>();
  const [invoice, setInvoice] = useState<PortalInvoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentRef, setPaymentRef] = useState('');

  const load = async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const resp = await clientPortalService.getInvoice(token);
      setInvoice(resp.data);
      const balance = Number(resp.data.balance_due ?? resp.data.total ?? 0);
      setPaymentAmount(balance > 0 ? String(balance) : '');
    } catch (e) {
      setError(getApiErrorMessage(e, 'Invalid or expired portal link'));
      setInvoice(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [token]);

  const handleApprove = async () => {
    if (!token) return;
    setActionLoading(true);
    try {
      await clientPortalService.approve(token);
      await load();
    } catch (e) {
      setError(getApiErrorMessage(e, 'Failed to approve invoice'));
    } finally {
      setActionLoading(false);
    }
  };

  const handlePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setActionLoading(true);
    try {
      await clientPortalService.recordPayment(token, {
        amount: Number(paymentAmount),
        reference: paymentRef || undefined,
        method: 'bank_transfer',
      });
      await load();
    } catch (e) {
      setError(getApiErrorMessage(e, 'Failed to record payment'));
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white">
        <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white p-6">
        <p className="text-red-300">{error ?? 'Invoice not found'}</p>
      </div>
    );
  }

  const canApprove = !invoice.client_approved_at && !['paid', 'cancelled'].includes(invoice.status);
  const balanceDue = Number(invoice.balance_due ?? 0);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-white p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <div className="flex items-center gap-3 mb-4">
            <FileText className="w-8 h-8 text-blue-400" />
            <div>
              <h1 className="text-2xl font-bold">Invoice #{invoice.invoice_number}</h1>
              <p className="text-slate-400">{invoice.client_name}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm mb-6">
            <div><span className="text-slate-400">Issue date</span><p>{invoice.issue_date}</p></div>
            <div><span className="text-slate-400">Due date</span><p>{invoice.due_date}</p></div>
            <div><span className="text-slate-400">Status</span><p className="capitalize">{invoice.status.replace('_', ' ')}</p></div>
            <div><span className="text-slate-400">Total</span><p className="text-xl font-semibold">{invoice.currency} {Number(invoice.total).toFixed(2)}</p></div>
          </div>

          {invoice.items && invoice.items.length > 0 && (
            <div className="overflow-x-auto mb-6">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-slate-400 border-b border-white/10"><th className="py-2">Description</th><th>Qty</th><th>Rate</th><th>Amount</th></tr></thead>
                <tbody>
                  {invoice.items.map((item) => (
                    <tr key={item.id} className="border-b border-white/5">
                      <td className="py-2">{item.description}</td>
                      <td>{item.quantity}</td>
                      <td>{Number(item.unit_price).toFixed(2)}</td>
                      <td>{Number(item.amount).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            {canApprove && (
              <Button onClick={handleApprove} disabled={actionLoading} className="gap-2">
                {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                Approve Invoice
              </Button>
            )}
            {invoice.client_approved_at && (
              <span className="inline-flex items-center gap-2 text-emerald-400 text-sm">
                <CheckCircle2 className="w-4 h-4" /> Approved {new Date(invoice.client_approved_at).toLocaleDateString()}
              </span>
            )}
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2"><CreditCard className="w-5 h-5" /> Payment Tracking</h2>
          <p className="text-sm text-slate-400 mb-4">
            Paid: {invoice.currency} {Number(invoice.amount_paid ?? 0).toFixed(2)} · Balance: {invoice.currency} {balanceDue.toFixed(2)}
          </p>

          {balanceDue > 0 && (
            <form onSubmit={handlePayment} className="grid gap-3 sm:grid-cols-3 mb-6">
              <input type="number" step="0.01" min="0.01" value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} placeholder="Amount" className="rounded-lg bg-slate-800 border border-white/10 px-3 py-2" required />
              <input value={paymentRef} onChange={(e) => setPaymentRef(e.target.value)} placeholder="Reference (optional)" className="rounded-lg bg-slate-800 border border-white/10 px-3 py-2" />
              <Button type="submit" disabled={actionLoading}>Record Payment</Button>
            </form>
          )}

          {invoice.payments && invoice.payments.length > 0 ? (
            <ul className="space-y-2 text-sm">
              {invoice.payments.map((p) => (
                <li key={p.id} className="flex justify-between border-b border-white/5 py-2">
                  <span>{new Date(p.paid_at).toLocaleDateString()} · {p.method}{p.reference ? ` · ${p.reference}` : ''}</span>
                  <span>{invoice.currency} {Number(p.amount).toFixed(2)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-slate-500 text-sm">No payments recorded yet.</p>
          )}
        </motion.div>

        {error && <p className="text-red-300 text-sm">{error}</p>}
      </div>
    </div>
  );
};

export default ClientPortalPage;
