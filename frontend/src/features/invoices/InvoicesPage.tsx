import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { FileText, Plus, Download, Mail, MoreVertical, Search, Filter, CheckCircle2, Clock, X, ExternalLink, Sparkles } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '../../components/ui';
import { invoiceService, type Invoice } from '../../api/invoiceService';
import { clientService, type Client } from '../../api/clientService';
import { projectService, type Project } from '../../api/projectService';
import { getApiErrorMessage } from '../../utils/apiError';

const toNumber = (value: unknown): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const invoiceAmount = (inv: Invoice): number => {
  return toNumber(inv.total ?? inv.amount ?? inv.subtotal ?? 0);
};

type CreateMode = 'manual' | 'from_time';

const defaultDueDate = () => {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d.toISOString().slice(0, 10);
};

const defaultStartDate = () => {
  const d = new Date();
  d.setDate(1);
  return d.toISOString().slice(0, 10);
};

const InvoicesPage = () => {
  const navigate = useNavigate();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [stats, setStats] = useState({ total_invoiced: 0, paid_amount: 0, outstanding: 0 });
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createMode, setCreateMode] = useState<CreateMode>('manual');
  const [clients, setClients] = useState<Client[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [form, setForm] = useState({
    client_id: '',
    client_name: '',
    client_email: '',
    project_id: '',
    due_date: defaultDueDate(),
    start_date: defaultStartDate(),
    end_date: new Date().toISOString().slice(0, 10),
    tax_rate: '',
    notes: '',
  });

  useEffect(() => {
    fetchInvoices();
  }, []);

  useEffect(() => {
    if (!showCreateModal) return;
    Promise.all([
      clientService.getAll({ is_active: 1 }),
      projectService.getAll({ is_active: 1 }),
    ])
      .then(([clientResp, projectResp]) => {
        setClients(clientResp.data ?? []);
        setProjects(projectResp.data ?? []);
      })
      .catch(() => {
        setClients([]);
        setProjects([]);
      });
  }, [showCreateModal]);

  const filteredProjects = useMemo(() => {
    if (!form.client_id) return projects;
    return projects.filter((p) => String(p.client_id ?? '') === form.client_id);
  }, [projects, form.client_id]);

  const fetchInvoices = async () => {
    try {
      const resp = await invoiceService.getAll();
      const records = resp.data ?? [];
      setInvoices(records);

      const total = records.reduce((sum, inv) => sum + invoiceAmount(inv), 0);
      const paid = records.filter((inv) => inv.status === 'paid').reduce((sum, inv) => sum + invoiceAmount(inv), 0);
      const outstanding = records.filter((inv) => inv.status !== 'paid').reduce((sum, inv) => sum + invoiceAmount(inv), 0);

      setStats({
        total_invoiced: total,
        paid_amount: paid,
        outstanding: outstanding,
      });
    } catch (e) {
      console.error(e);
      setInvoices([]);
    }
  };

  const resetForm = () => {
    setCreateMode('manual');
    setCreateError(null);
    setForm({
      client_id: '',
      client_name: '',
      client_email: '',
      project_id: '',
      due_date: defaultDueDate(),
      start_date: defaultStartDate(),
      end_date: new Date().toISOString().slice(0, 10),
      tax_rate: '',
      notes: '',
    });
  };

  const handleClientSelect = (clientId: string) => {
    const selected = clients.find((c) => String(c.id) === clientId);
    setForm((f) => ({
      ...f,
      client_id: clientId,
      client_name: selected?.name ?? f.client_name,
      client_email: selected?.email ?? f.client_email,
      project_id: '',
    }));
  };

  const handleCreateInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreating(true);
    setCreateError(null);

    const payload = {
      client_name: form.client_name.trim(),
      client_email: form.client_email.trim() || undefined,
      client_id: form.client_id ? Number(form.client_id) : undefined,
      project_id: form.project_id ? Number(form.project_id) : undefined,
      due_date: form.due_date,
      notes: form.notes.trim() || undefined,
      tax_rate: form.tax_rate ? Number(form.tax_rate) : undefined,
    };

    try {
      let resp;
      if (createMode === 'from_time') {
        resp = await invoiceService.generateFromTime({
          ...payload,
          start_date: form.start_date,
          end_date: form.end_date,
        });
      } else {
        resp = await invoiceService.create(payload);
      }

      const invoiceId = resp.data?.id;
      setShowCreateModal(false);
      resetForm();
      await fetchInvoices();
      if (invoiceId) {
        navigate(`/invoices/${invoiceId}`);
      }
    } catch (err) {
      setCreateError(getApiErrorMessage(err, 'Failed to create invoice'));
    } finally {
      setIsCreating(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'paid': return 'text-green-400 bg-green-500/10 border-green-500/20';
      case 'sent': return 'text-primary-400 bg-primary-500/10 border-primary-500/20';
      case 'draft': return 'text-slate-400 bg-white/5 border-white/10';
      default: return 'text-slate-400';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'paid': return CheckCircle2;
      case 'sent': return Clock;
      case 'draft': return FileText;
      default: return FileText;
    }
  };

  const inputClass = 'w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-primary-500/50';

  return (
    <>
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2 flex items-center gap-2">
            <FileText className="text-primary-400" />
            Invoices
          </h1>
          <p className="text-slate-400">Manage client billing and track payment status.</p>
        </div>

        <Button onClick={() => { resetForm(); setShowCreateModal(true); }}>
          <Plus className="w-4 h-4 mr-2" />
          Create Invoice
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[
          { label: 'Total Invoiced', value: `$${stats.total_invoiced.toLocaleString()}`, trend: '+12%', icon: FileText, color: 'primary' },
          { label: 'Paid Amount', value: `$${stats.paid_amount.toLocaleString()}`, trend: '23%', icon: CheckCircle2, color: 'green' },
          { label: 'Outstanding', value: `$${stats.outstanding.toLocaleString()}`, trend: '77%', icon: Clock, color: 'yellow' },
        ].map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="glass-card flex items-center gap-4"
          >
            <div className={`w-12 h-12 rounded-2xl bg-${stat.color}-500/10 flex items-center justify-center text-${stat.color}-400 border border-${stat.color}-500/20`}>
              <stat.icon size={24} />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">{stat.label}</p>
              <h4 className="text-2xl font-bold text-white">{stat.value}</h4>
              <p className="text-[10px] text-slate-400 mt-1">{stat.trend} this month</p>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="glass-card p-0 overflow-hidden">
        <div className="p-6 border-b border-white/5 flex items-center justify-between">
          <h3 className="font-bold text-white">Recent Invoices</h3>
          <div className="flex gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-500" />
              <input type="text" placeholder="Search..." className="bg-white/5 border border-white/10 rounded-lg pl-8 pr-4 py-1.5 text-xs text-white focus:outline-none focus:border-primary-500/50" />
            </div>
            <Button variant="secondary" size="sm" className="h-8 py-0">
              <Filter className="w-3 h-3 mr-2" />
              Filter
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-white/5 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                <th className="px-6 py-4">Invoice ID</th>
                <th className="px-6 py-4">Client</th>
                <th className="px-6 py-4">Project</th>
                <th className="px-6 py-4">Amount</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {invoices.map((inv) => {
                const Icon = getStatusIcon(inv.status);
                return (
                  <tr key={inv.id} className="hover:bg-white/5 transition-colors group">
                    <td className="px-6 py-4">
                      <Link to={`/invoices/${inv.id}`} className="text-sm font-bold text-white hover:text-primary-400">
                        #{inv.invoice_number}
                      </Link>
                      <p className="text-[10px] text-slate-500 mt-0.5">{new Date(inv.issue_date).toLocaleDateString()}</p>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-300 font-medium">{inv.client_name}</td>
                    <td className="px-6 py-4 text-sm text-slate-400">{inv.project_name || '-'}</td>
                    <td className="px-6 py-4 text-sm font-bold text-white">${invoiceAmount(inv).toLocaleString()}</td>
                    <td className="px-6 py-4">
                      <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-[10px] font-bold uppercase tracking-wider ${getStatusColor(inv.status)}`}>
                        <Icon size={12} />
                        {inv.status}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          to={`/invoices/${inv.id}`}
                          className="p-2 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-all opacity-0 group-hover:opacity-100"
                        >
                          <ExternalLink size={16} />
                        </Link>
                        <button className="p-2 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-all opacity-0 group-hover:opacity-100">
                          <Download size={16} />
                        </button>
                        <button className="p-2 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-all opacity-0 group-hover:opacity-100">
                          <Mail size={16} />
                        </button>
                        <button className="p-2 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-all">
                          <MoreVertical size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>

    {showCreateModal && (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
        <form onSubmit={handleCreateInvoice} className="w-full max-w-xl glass-card border border-white/10 p-6 space-y-4 max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xl font-bold text-white">Create Invoice</h3>
              <p className="text-xs text-slate-500 mt-1">Link a client, add billing details, or pull tracked hours.</p>
            </div>
            <button type="button" onClick={() => setShowCreateModal(false)} className="text-slate-500 hover:text-white">
              <X size={20} />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-white/5 border border-white/10">
            {([
              ['manual', 'Blank invoice'],
              ['from_time', 'From tracked time'],
            ] as const).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                onClick={() => setCreateMode(mode)}
                className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                  createMode === mode ? 'bg-primary-500 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Client</label>
            <select
              value={form.client_id}
              onChange={(e) => handleClientSelect(e.target.value)}
              className={`${inputClass} mt-1`}
            >
              <option value="">Select existing client (optional)</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name}{c.email ? ` · ${c.email}` : ''}</option>
              ))}
            </select>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Client name *</label>
              <input
                required
                placeholder="Client name"
                value={form.client_name}
                onChange={(e) => setForm((f) => ({ ...f, client_name: e.target.value }))}
                className={`${inputClass} mt-1`}
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Client email</label>
              <input
                type="email"
                placeholder="Required to send invoice"
                value={form.client_email}
                onChange={(e) => setForm((f) => ({ ...f, client_email: e.target.value }))}
                className={`${inputClass} mt-1`}
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Project</label>
            <select
              value={form.project_id}
              onChange={(e) => setForm((f) => ({ ...f, project_id: e.target.value }))}
              className={`${inputClass} mt-1`}
            >
              <option value="">No project / all projects</option>
              {filteredProjects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <p className="text-[11px] text-slate-500 mt-1">Proof-of-Work Pack uses project time when linked.</p>
          </div>

          {createMode === 'from_time' && (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 space-y-3">
              <p className="text-sm font-medium text-emerald-300 flex items-center gap-2">
                <Sparkles className="w-4 h-4" />
                Pull billable hours into line items automatically
              </p>
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Period start *</label>
                  <input
                    required
                    type="date"
                    value={form.start_date}
                    onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))}
                    className={`${inputClass} mt-1`}
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Period end *</label>
                  <input
                    required
                    type="date"
                    value={form.end_date}
                    onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))}
                    className={`${inputClass} mt-1`}
                  />
                </div>
              </div>
            </div>
          )}

          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Due date *</label>
              <input
                required
                type="date"
                value={form.due_date}
                onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))}
                className={`${inputClass} mt-1`}
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Tax rate %</label>
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="0"
                value={form.tax_rate}
                onChange={(e) => setForm((f) => ({ ...f, tax_rate: e.target.value }))}
                className={`${inputClass} mt-1`}
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Notes</label>
            <textarea
              placeholder="Invoice notes"
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              className={`${inputClass} mt-1 min-h-24`}
            />
          </div>

          {createError && <p className="text-sm text-rose-400">{createError}</p>}

          <Button type="submit" isLoading={isCreating} className="w-full">
            {createMode === 'from_time' ? 'Generate invoice from time' : 'Create & open invoice'}
          </Button>
        </form>
      </div>
    )}
    </>
  );
};

export default InvoicesPage;
