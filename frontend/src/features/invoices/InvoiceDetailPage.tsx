import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  FileText,
  Plus,
  Send,
  Download,
  Loader2,
  ArrowLeft,
  CheckCircle2,
} from 'lucide-react';
import { Button } from '../../components/ui';
import { invoiceService, type Invoice } from '../../api/invoiceService';
import { hasPermission } from '../../utils/access';
import { useAuthStore } from '../../store/authStore';
import { getApiErrorMessage } from '../../utils/apiError';

const toNumber = (value: unknown): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const InvoiceDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const invoiceId = Number(id);
  const { user } = useAuthStore();

  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [showAddItem, setShowAddItem] = useState(false);
  const [itemForm, setItemForm] = useState({ description: '', quantity: '1', unit_price: '' });

  const canEdit = hasPermission(user, 'invoices.edit');
  const canSend = hasPermission(user, 'invoices.send');

  const load = async () => {
    if (!invoiceId) return;
    setLoading(true);
    setError(null);
    try {
      const resp = await invoiceService.getById(invoiceId);
      setInvoice(resp.data);
    } catch (e) {
      setError(getApiErrorMessage(e, 'Failed to load invoice'));
      setInvoice(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [invoiceId]);

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading(true);
    try {
      await invoiceService.addItem(invoiceId, {
        description: itemForm.description,
        quantity: Number(itemForm.quantity),
        unit_price: Number(itemForm.unit_price),
      });
      setShowAddItem(false);
      setItemForm({ description: '', quantity: '1', unit_price: '' });
      await load();
    } catch (e) {
      setError(getApiErrorMessage(e, 'Failed to add line item'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleSend = async () => {
    setActionLoading(true);
    try {
      await invoiceService.send(invoiceId);
      await load();
    } catch (e) {
      setError(getApiErrorMessage(e, 'Failed to send invoice'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleMarkPaid = async () => {
    setActionLoading(true);
    try {
      await invoiceService.updateStatus(invoiceId, 'paid');
      await load();
    } catch (e) {
      setError(getApiErrorMessage(e, 'Failed to update status'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleDownloadPdf = async () => {
    setActionLoading(true);
    try {
      await invoiceService.downloadPdf(invoiceId, `invoice-${invoice?.invoice_number ?? invoiceId}.pdf`);
    } catch (e) {
      setError(getApiErrorMessage(e, 'Failed to download PDF'));
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="w-10 h-10 text-primary-500 animate-spin" />
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="text-center py-20">
        <p className="text-slate-400">{error || 'Invoice not found'}</p>
        <Link to="/invoices" className="text-primary-400 text-sm font-bold hover:underline mt-4 inline-block">
          Back to invoices
        </Link>
      </div>
    );
  }

  const items = invoice.items ?? [];
  const total = toNumber(invoice.total ?? invoice.amount ?? invoice.subtotal);

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div>
          <Link to="/invoices" className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white mb-4">
            <ArrowLeft size={16} />
            Back to invoices
          </Link>
          <h1 className="text-3xl font-bold text-white flex items-center gap-3">
            <FileText className="text-primary-400" />
            Invoice #{invoice.invoice_number}
          </h1>
          <p className="text-slate-400 mt-2">
            {invoice.client_name}
            {invoice.client_email ? ` · ${invoice.client_email}` : ''}
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Button variant="secondary" onClick={handleDownloadPdf} isLoading={actionLoading} className="!rounded-xl">
            <Download size={16} className="mr-2" />
            PDF
          </Button>
          {canSend && invoice.status !== 'paid' && invoice.status !== 'sent' && (
            <Button onClick={handleSend} isLoading={actionLoading} className="!rounded-xl">
              <Send size={16} className="mr-2" />
              Send
            </Button>
          )}
          {canEdit && invoice.status !== 'paid' && (
            <Button variant="secondary" onClick={handleMarkPaid} isLoading={actionLoading} className="!rounded-xl">
              <CheckCircle2 size={16} className="mr-2" />
              Mark paid
            </Button>
          )}
          {canEdit && (
            <Button variant="secondary" onClick={() => setShowAddItem(true)} className="!rounded-xl">
              <Plus size={16} className="mr-2" />
              Add item
            </Button>
          )}
        </div>
      </div>

      {error && <p className="text-rose-400 text-sm">{error}</p>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass-card lg:col-span-2 p-0 overflow-hidden">
          <div className="p-6 border-b border-white/5">
            <h3 className="font-bold text-white">Line items</h3>
          </div>
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-white/5 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                <th className="px-6 py-4">Description</th>
                <th className="px-6 py-4">Qty</th>
                <th className="px-6 py-4">Unit price</th>
                <th className="px-6 py-4 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {items.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-slate-500 text-sm">
                    No line items yet.
                  </td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr key={item.id} className="hover:bg-white/[0.02]">
                    <td className="px-6 py-4 text-sm text-white">{item.description}</td>
                    <td className="px-6 py-4 text-sm text-slate-300">{item.quantity}</td>
                    <td className="px-6 py-4 text-sm text-slate-300">${toNumber(item.unit_price).toFixed(2)}</td>
                    <td className="px-6 py-4 text-sm font-bold text-white text-right">
                      ${toNumber(item.amount).toFixed(2)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="glass-card space-y-4">
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Status</p>
            <p className="text-lg font-bold text-white capitalize mt-1">{invoice.status}</p>
          </div>
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Issue date</p>
            <p className="text-white mt-1">{new Date(invoice.issue_date).toLocaleDateString()}</p>
          </div>
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Due date</p>
            <p className="text-white mt-1">{new Date(invoice.due_date).toLocaleDateString()}</p>
          </div>
          <div className="pt-4 border-t border-white/10">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Subtotal</p>
            <p className="text-white mt-1">${toNumber(invoice.subtotal).toFixed(2)}</p>
            {invoice.tax_amount != null && (
              <>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-3">Tax</p>
                <p className="text-white mt-1">${toNumber(invoice.tax_amount).toFixed(2)}</p>
              </>
            )}
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-3">Total</p>
            <p className="text-2xl font-bold text-primary-400 mt-1">${total.toFixed(2)}</p>
          </div>
          {invoice.notes && (
            <div className="pt-4 border-t border-white/10">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Notes</p>
              <p className="text-sm text-slate-300 mt-1">{invoice.notes}</p>
            </div>
          )}
        </motion.div>
      </div>

      {showAddItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <form onSubmit={handleAddItem} className="w-full max-w-md glass-card border border-white/10 p-6 space-y-4">
            <h3 className="text-lg font-bold text-white">Add line item</h3>
            <input
              required
              placeholder="Description"
              value={itemForm.description}
              onChange={(e) => setItemForm((f) => ({ ...f, description: e.target.value }))}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none"
            />
            <div className="grid grid-cols-2 gap-3">
              <input
                required
                type="number"
                min="0"
                step="0.01"
                placeholder="Quantity"
                value={itemForm.quantity}
                onChange={(e) => setItemForm((f) => ({ ...f, quantity: e.target.value }))}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none"
              />
              <input
                required
                type="number"
                min="0"
                step="0.01"
                placeholder="Unit price"
                value={itemForm.unit_price}
                onChange={(e) => setItemForm((f) => ({ ...f, unit_price: e.target.value }))}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none"
              />
            </div>
            <div className="flex gap-3">
              <Button variant="secondary" type="button" className="flex-1" onClick={() => setShowAddItem(false)}>
                Cancel
              </Button>
              <Button type="submit" className="flex-1" isLoading={actionLoading}>
                Add
              </Button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default InvoiceDetailPage;
