import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { FileText, Plus, Download, Mail, MoreVertical, Search, Filter, CheckCircle2, Clock, X, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '../../components/ui';

import { invoiceService, type Invoice } from '../../api/invoiceService';

const toNumber = (value: unknown): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const invoiceAmount = (inv: Invoice): number => {
  return toNumber(inv.total ?? inv.amount ?? inv.subtotal ?? 0);
};

const InvoicesPage = () => {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [stats, setStats] = useState({ total_invoiced: 0, paid_amount: 0, outstanding: 0 });
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [form, setForm] = useState({ client_name: '', due_date: '', notes: '' });

  useEffect(() => {
    fetchInvoices();
  }, []);

  const fetchInvoices = async () => {
    try {
      const resp = await invoiceService.getAll();
      const records = resp.data ?? [];
      setInvoices(records);
      
      // Calculate stats on frontend
      const total = records.reduce((sum, inv) => sum + invoiceAmount(inv), 0);
      const paid = records.filter(inv => inv.status === 'paid').reduce((sum, inv) => sum + invoiceAmount(inv), 0);
      const outstanding = records.filter(inv => inv.status !== 'paid').reduce((sum, inv) => sum + invoiceAmount(inv), 0);
      
      setStats({
          total_invoiced: total,
          paid_amount: paid,
          outstanding: outstanding
      });
    } catch (e) {
      console.error(e);
      setInvoices([]);
    } finally {
      // no-op
    }
  };

  const handleCreateInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreating(true);
    try {
      await invoiceService.create(form);
      setShowCreateModal(false);
      setForm({ client_name: '', due_date: '', notes: '' });
      await fetchInvoices();
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
        
        <Button onClick={() => setShowCreateModal(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Create Invoice
        </Button>
      </div>

      {/* Stats Cards */}
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

      {/* Invoice Table */}
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
        <form onSubmit={handleCreateInvoice} className="w-full max-w-lg glass-card border border-white/10 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-bold text-white">Create Invoice</h3>
            <button type="button" onClick={() => setShowCreateModal(false)} className="text-slate-500 hover:text-white">
              <X size={20} />
            </button>
          </div>
          <input
            required
            placeholder="Client name"
            value={form.client_name}
            onChange={(e) => setForm((f) => ({ ...f, client_name: e.target.value }))}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none"
          />
          <input
            required
            type="date"
            value={form.due_date}
            onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none"
          />
          <textarea
            placeholder="Invoice notes"
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none min-h-28"
          />
          <Button type="submit" isLoading={isCreating} className="w-full">Create</Button>
        </form>
      </div>
    )}
    </>
  );
};

export default InvoicesPage;
