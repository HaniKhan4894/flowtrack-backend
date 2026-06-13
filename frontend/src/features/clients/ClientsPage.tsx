import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Building2, Plus, Search, Mail, Phone, X, Trash2, Edit2 } from 'lucide-react';
import { Button, Input } from '../../components/ui';
import { clientService, type Client } from '../../api/clientService';
import { hasPermission } from '../../utils/access';
import { useAuthStore } from '../../store/authStore';
import { getApiErrorMessage } from '../../utils/apiError';

const ClientsPage = () => {
  const { user } = useAuthStore();
  const canEdit = hasPermission(user, 'invoices.edit') || hasPermission(user, 'invoices.create');
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', email: '', phone: '', default_rate: '', notes: '' });

  const fetchClients = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await clientService.getAll({ search: searchTerm || undefined, is_active: 1 });
      setClients(resp.data ?? []);
    } catch (e) {
      console.error(e);
      setClients([]);
    } finally {
      setLoading(false);
    }
  }, [searchTerm]);

  useEffect(() => {
    const t = setTimeout(fetchClients, 300);
    return () => clearTimeout(t);
  }, [fetchClients]);

  const openCreate = () => {
    setEditing(null);
    setForm({ name: '', email: '', phone: '', default_rate: '', notes: '' });
    setShowModal(true);
  };

  const openEdit = (client: Client) => {
    setEditing(client);
    setForm({
      name: client.name,
      email: client.email ?? '',
      phone: client.phone ?? '',
      default_rate: client.default_rate != null ? String(client.default_rate) : '',
      notes: client.notes ?? '',
    });
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: form.name,
        email: form.email || null,
        phone: form.phone || null,
        default_rate: form.default_rate ? parseFloat(form.default_rate) : null,
        notes: form.notes || null,
      };
      if (editing) {
        await clientService.update(editing.id, payload);
      } else {
        await clientService.create(payload);
      }
      setShowModal(false);
      fetchClients();
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to save client'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (client: Client) => {
    if (!confirm(`Delete client "${client.name}"?`)) return;
    try {
      await clientService.delete(client.id);
      fetchClients();
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to delete client'));
    }
  };

  return (
    <div className="space-y-8 pb-12">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Clients</h1>
          <p className="text-slate-400">Manage client contacts for projects and invoicing.</p>
        </div>
        {canEdit && (
          <Button className="w-fit" onClick={openCreate}>
            <Plus className="w-5 h-5 mr-2" /> New Client
          </Button>
        )}
      </div>

      {error && <p className="text-rose-400 text-sm">{error}</p>}

      <div className="relative max-w-md">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 w-5 h-5" />
        <Input
          placeholder="Search clients..."
          className="pl-12"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {loading ? (
          [1, 2, 3].map((i) => <div key={i} className="glass-card animate-pulse h-48" />)
        ) : clients.length === 0 ? (
          <div className="col-span-full text-center py-20 text-slate-500">
            <Building2 size={48} className="mx-auto mb-4 opacity-30" />
            <p>No clients found.</p>
          </div>
        ) : (
          clients.map((client) => (
            <motion.div key={client.id} className="glass-card p-6 space-y-4" whileHover={{ y: -4 }}>
              <div className="flex justify-between items-start">
                <div className="p-3 rounded-xl bg-primary-500/10 text-primary-400">
                  <Building2 size={22} />
                </div>
                {canEdit && (
                  <div className="flex gap-1">
                    <button onClick={() => openEdit(client)} className="p-2 text-slate-500 hover:text-primary-400">
                      <Edit2 size={16} />
                    </button>
                    <button onClick={() => handleDelete(client)} className="p-2 text-slate-500 hover:text-rose-400">
                      <Trash2 size={16} />
                    </button>
                  </div>
                )}
              </div>
              <div>
                <h3 className="text-xl font-bold text-white">{client.name}</h3>
                {client.email && (
                  <p className="text-sm text-slate-400 flex items-center gap-2 mt-1">
                    <Mail size={14} /> {client.email}
                  </p>
                )}
                {client.phone && (
                  <p className="text-sm text-slate-400 flex items-center gap-2 mt-1">
                    <Phone size={14} /> {client.phone}
                  </p>
                )}
              </div>
              {client.default_rate != null && (
                <p className="text-xs font-bold text-primary-400 uppercase tracking-wider">
                  Default rate: ${client.default_rate}/hr
                </p>
              )}
            </motion.div>
          ))
        )}
      </div>

      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/60" onClick={() => setShowModal(false)} />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="relative w-full max-w-lg glass-card p-8" onClick={(e) => e.stopPropagation()}>
              <div className="flex justify-between mb-6">
                <h2 className="text-2xl font-bold text-white">{editing ? 'Edit Client' : 'New Client'}</h2>
                <button onClick={() => setShowModal(false)}><X size={24} className="text-slate-500" /></button>
              </div>
              <form onSubmit={handleSave} className="space-y-4">
                <Input required value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder="Client name" />
                <Input type="email" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} placeholder="Email" />
                <Input value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} placeholder="Phone" />
                <Input type="number" step="0.01" value={form.default_rate} onChange={(e) => setForm((p) => ({ ...p, default_rate: e.target.value }))} placeholder="Default hourly rate" />
                <textarea value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} placeholder="Notes" className="w-full h-24 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white resize-none" />
                <Button type="submit" className="w-full" isLoading={saving}>{editing ? 'Save Changes' : 'Create Client'}</Button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ClientsPage;
