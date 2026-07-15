import { useState, useEffect, useMemo } from 'react';
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
  Copy,
  ExternalLink,
  ShieldCheck,
  Sparkles,
  Pencil,
} from 'lucide-react';
import { Button, SearchableSelect, Modal } from '../../components/ui';
import { invoiceService, type Invoice } from '../../api/invoiceService';
import { clientService, type Client } from '../../api/clientService';
import { projectService, type Project } from '../../api/projectService';
import { hasPermission } from '../../utils/access';
import { useAuthStore } from '../../store/authStore';
import { getApiErrorMessage } from '../../utils/apiError';
import { formatApiDate } from '../../utils/date';
import { filterProjectsForClient } from '../../utils/projectFilters';

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
  const [showEditMeta, setShowEditMeta] = useState(false);
  const [showGenerateTime, setShowGenerateTime] = useState(false);
  const [itemForm, setItemForm] = useState({ description: '', quantity: '1', unit_price: '' });
  const [metaForm, setMetaForm] = useState({
    client_name: '',
    client_email: '',
    client_id: '',
    project_id: '',
    due_date: '',
    tax_rate: '',
    notes: '',
  });
  const [timeForm, setTimeForm] = useState({
    start_date: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10),
    end_date: new Date().toISOString().slice(0, 10),
  });
  const [clients, setClients] = useState<Client[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [portalUrl, setPortalUrl] = useState<string | null>(null);
  const [payments, setPayments] = useState<{ id: number; amount: number; method: string; reference?: string; paid_at: string }[]>([]);

  const canEdit = hasPermission(user, 'invoices.edit');
  const canSend = hasPermission(user, 'invoices.send');
  const isDraft = invoice?.status === 'draft';

  const filteredProjects = useMemo(
    () => filterProjectsForClient(projects, clients, metaForm.client_id),
    [projects, clients, metaForm.client_id],
  );

  const clientOptions = useMemo(
    () => [
      { value: '', label: 'Link to client record (optional)' },
      ...clients.map((c) => ({ value: c.id, label: c.name })),
    ],
    [clients],
  );

  const projectOptions = useMemo(
    () => [
      { value: '', label: 'No project' },
      ...filteredProjects.map((p) => ({ value: p.id, label: p.name })),
    ],
    [filteredProjects],
  );

  const load = async () => {
    if (!invoiceId) return;
    setLoading(true);
    setError(null);
    try {
      const resp = await invoiceService.getById(invoiceId);
      setInvoice(resp.data);
      setMetaForm({
        client_name: resp.data.client_name ?? '',
        client_email: resp.data.client_email ?? '',
        client_id: resp.data.client_id ? String(resp.data.client_id) : '',
        project_id: resp.data.project_id ? String(resp.data.project_id) : '',
        due_date: resp.data.due_date?.slice(0, 10) ?? '',
        tax_rate: resp.data.tax_rate != null ? String(toNumber(resp.data.tax_rate)) : '',
        notes: resp.data.notes ?? '',
      });
      if (resp.data.status !== 'draft' && resp.data.status !== 'cancelled') {
        try {
          const portal = await invoiceService.getPortalLink(invoiceId);
          setPortalUrl(portal.data.url);
          const payResp = await invoiceService.getPayments(invoiceId);
          setPayments(payResp.data);
        } catch {
          setPortalUrl(null);
          setPayments([]);
        }
      } else {
        setPortalUrl(null);
        setPayments([]);
      }
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

  useEffect(() => {
    if (!showEditMeta && !showGenerateTime) return;
    Promise.all([
      clientService.getAll({ is_active: 1 }),
      projectService.getAll({ is_active: 1 }),
    ]).then(([clientResp, projectResp]) => {
      setClients(clientResp.data ?? []);
      setProjects(projectResp.data ?? []);
    }).catch(() => {
      setClients([]);
      setProjects([]);
    });
  }, [showEditMeta, showGenerateTime]);

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading(true);
    setError(null);
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

  const handleUpdateMeta = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading(true);
    setError(null);
    try {
      await invoiceService.update(invoiceId, {
        client_name: metaForm.client_name.trim(),
        client_email: metaForm.client_email.trim() || null,
        client_id: metaForm.client_id ? Number(metaForm.client_id) : null,
        project_id: metaForm.project_id ? Number(metaForm.project_id) : null,
        due_date: metaForm.due_date,
        notes: metaForm.notes.trim() || null,
        tax_rate: metaForm.tax_rate ? Number(metaForm.tax_rate) : 0,
      });
      setShowEditMeta(false);
      await load();
    } catch (e) {
      setError(getApiErrorMessage(e, 'Failed to update invoice'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleGenerateFromTime = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading(true);
    setError(null);
    try {
      await invoiceService.populateFromTime(invoiceId, {
        start_date: timeForm.start_date,
        end_date: timeForm.end_date,
        project_id: invoice?.project_id,
      });
      setShowGenerateTime(false);
      await load();
    } catch (e) {
      setError(getApiErrorMessage(e, 'No billable time found for this period'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleSend = async () => {
    if (!invoice?.client_email) {
      setError('Client email is required before sending. Edit invoice details to add an email.');
      setShowEditMeta(true);
      return;
    }
    setActionLoading(true);
    setError(null);
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

  const inputClass = 'form-field';

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
            {invoice.client_email ? ` · ${invoice.client_email}` : ' · no client email yet'}
          </p>
          {invoice.project_name && (
            <p className="text-sm text-slate-500 mt-1">Project: {invoice.project_name}</p>
          )}
        </div>

        <div className="flex flex-wrap gap-3">
          {canEdit && isDraft && (
            <Button variant="secondary" onClick={() => setShowEditMeta(true)} className="!rounded-xl">
              <Pencil size={16} className="mr-2" />
              Edit details
            </Button>
          )}
          <Button variant="secondary" onClick={handleDownloadPdf} isLoading={actionLoading} className="!rounded-xl">
            <Download size={16} className="mr-2" />
            PDF
          </Button>
          {canSend && !['paid', 'cancelled', 'pending_approval', 'approved', 'partially_paid', 'sent'].includes(invoice.status) && (
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
          {canEdit && isDraft && (
            <Button variant="secondary" onClick={() => setShowGenerateTime(true)} className="!rounded-xl">
              <Sparkles size={16} className="mr-2" />
              From time
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

      {isDraft && items.length === 0 && (
        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-100">
          This invoice is still a draft with <strong>$0</strong>. Add line items manually, or use <strong>From time</strong> to pull billable hours automatically.
        </div>
      )}

      {!invoice.client_email && isDraft && (
        <div className="rounded-2xl border border-rose-500/20 bg-rose-500/5 p-4 text-sm text-rose-100">
          Add a <strong>client email</strong> before sending — the client portal and Proof-of-Work Pack are delivered by email.
        </div>
      )}

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
            <p className="text-lg font-bold text-white capitalize mt-1">{invoice.status.replace('_', ' ')}</p>
          </div>
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Issue date</p>
            <p className="text-white mt-1">{formatApiDate(invoice.issue_date)}</p>
          </div>
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Due date</p>
            <p className="text-white mt-1">{formatApiDate(invoice.due_date)}</p>
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
          {portalUrl && (
            <div className="pt-4 border-t border-white/10 space-y-2">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Client portal</p>
              <p className="text-xs text-emerald-300 flex items-center gap-1">
                <ShieldCheck size={12} /> Includes Proof-of-Work Pack
              </p>
              <a href={portalUrl} target="_blank" rel="noreferrer" className="text-sm text-primary-400 hover:underline inline-flex items-center gap-1 break-all">
                <ExternalLink size={14} /> Open portal
              </a>
              <button
                type="button"
                className="text-xs text-slate-400 hover:text-white flex items-center gap-1"
                onClick={() => navigator.clipboard.writeText(portalUrl)}
              >
                <Copy size={12} /> Copy link for client
              </button>
              {invoice.client_approved_at && (
                <p className="text-xs text-emerald-400">Client approved {formatApiDate(invoice.client_approved_at)}</p>
              )}
              {payments.length > 0 && (
                <ul className="text-xs text-slate-300 space-y-1 mt-2">
                  {payments.map((p) => (
                    <li key={p.id}>{formatApiDate(p.paid_at)} — ${Number(p.amount).toFixed(2)}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </motion.div>
      </div>

      <Modal open={showAddItem} onClose={() => setShowAddItem(false)} title="Add line item" size="sm">
        <form onSubmit={handleAddItem} className="space-y-4">
          <input
            required
            placeholder="Description"
            value={itemForm.description}
            onChange={(e) => setItemForm((f) => ({ ...f, description: e.target.value }))}
            className={inputClass}
          />
          <div className="grid grid-cols-2 gap-3">
            <input
              required
              type="number"
              min="0"
              step="0.01"
              placeholder="Quantity (hours)"
              value={itemForm.quantity}
              onChange={(e) => setItemForm((f) => ({ ...f, quantity: e.target.value }))}
              className={inputClass}
            />
            <input
              required
              type="number"
              min="0"
              step="0.01"
              placeholder="Unit price ($)"
              value={itemForm.unit_price}
              onChange={(e) => setItemForm((f) => ({ ...f, unit_price: e.target.value }))}
              className={inputClass}
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
      </Modal>

      <Modal open={showEditMeta} onClose={() => setShowEditMeta(false)} title="Edit invoice details" size="md">
        <form onSubmit={handleUpdateMeta} className="space-y-4">
          <SearchableSelect
            value={metaForm.client_id}
            onChange={(val) => {
              const clientId = String(val);
              const selected = clients.find((c) => String(c.id) === clientId);
              const nextProjects = filterProjectsForClient(projects, clients, clientId);
              setMetaForm((f) => {
                const keepProject = nextProjects.some((p) => String(p.id) === f.project_id);
                return {
                  ...f,
                  client_id: clientId,
                  client_name: selected?.name ?? f.client_name,
                  client_email: selected?.email ?? f.client_email,
                  project_id: keepProject ? f.project_id : '',
                };
              });
            }}
            options={clientOptions}
            placeholder="Link to client record (optional)"
            searchPlaceholder="Search clients…"
          />
          <input required value={metaForm.client_name} onChange={(e) => setMetaForm((f) => ({ ...f, client_name: e.target.value }))} placeholder="Client name" className={inputClass} />
          <input type="email" value={metaForm.client_email} onChange={(e) => setMetaForm((f) => ({ ...f, client_email: e.target.value }))} placeholder="Client email (required to send)" className={inputClass} />
          <SearchableSelect
            value={metaForm.project_id}
            onChange={(val) => setMetaForm((f) => ({ ...f, project_id: String(val) }))}
            options={projectOptions}
            placeholder="No project"
            searchPlaceholder="Search projects…"
          />
          <div className="grid grid-cols-2 gap-3">
            <input required type="date" value={metaForm.due_date} onChange={(e) => setMetaForm((f) => ({ ...f, due_date: e.target.value }))} className={inputClass} />
            <input type="number" min="0" step="0.01" placeholder="Tax rate %" value={metaForm.tax_rate} onChange={(e) => setMetaForm((f) => ({ ...f, tax_rate: e.target.value }))} className={inputClass} />
          </div>
          <textarea value={metaForm.notes} onChange={(e) => setMetaForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Notes" className={`${inputClass} min-h-24`} />
          <div className="flex gap-3">
            <Button variant="secondary" type="button" className="flex-1" onClick={() => setShowEditMeta(false)}>Cancel</Button>
            <Button type="submit" className="flex-1" isLoading={actionLoading}>Save</Button>
          </div>
        </form>
      </Modal>

      <Modal open={showGenerateTime} onClose={() => setShowGenerateTime(false)} title="Generate from tracked time" size="sm">
        <form onSubmit={handleGenerateFromTime} className="space-y-4">
          <p className="text-sm text-slate-400">Adds line items from billable hours in the selected period to this draft invoice.</p>
          <input required type="date" value={timeForm.start_date} onChange={(e) => setTimeForm((f) => ({ ...f, start_date: e.target.value }))} className={inputClass} />
          <input required type="date" value={timeForm.end_date} onChange={(e) => setTimeForm((f) => ({ ...f, end_date: e.target.value }))} className={inputClass} />
          <div className="flex gap-3">
            <Button variant="secondary" type="button" className="flex-1" onClick={() => setShowGenerateTime(false)}>Cancel</Button>
            <Button type="submit" className="flex-1" isLoading={actionLoading}>Generate</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default InvoiceDetailPage;
