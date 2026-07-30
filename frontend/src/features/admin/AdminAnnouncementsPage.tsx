import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Info, Mail, Megaphone, Pencil, Plus, Send, Trash2, TriangleAlert } from 'lucide-react';
import { adminService } from '../../api/adminService';
import { getApiErrorMessage } from '../../utils/apiError';
import { toastError, toastSuccess } from '../../store/toastStore';
import type { AdminAnnouncement, AdminPlan } from '../../types/admin';
import { Badge, Button, Card, Modal, PageSkeleton } from '../../components/ui';
import { ConfirmDialog } from './components/AdminUI';
import { formatDateTime, formatNumber, formatRelative } from './components/format';

const LEVELS = [
  { value: 'info', label: 'Info', icon: Info, className: 'border-cyan-500/25 bg-cyan-500/10 text-cyan-300' },
  { value: 'success', label: 'Success', icon: Megaphone, className: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300' },
  { value: 'warning', label: 'Warning', icon: TriangleAlert, className: 'border-amber-500/25 bg-amber-500/10 text-amber-300' },
  { value: 'critical', label: 'Critical', icon: AlertTriangle, className: 'border-rose-500/25 bg-rose-500/10 text-rose-300' },
] as const;

const levelMeta = (level: string) => LEVELS.find((l) => l.value === level) ?? LEVELS[0];

interface AnnouncementForm {
  title: string;
  message: string;
  level: 'info' | 'success' | 'warning' | 'critical';
  audience: 'all' | 'plan' | 'organization';
  plan_id: string;
  organization_id: string;
  is_active: boolean;
  is_dismissible: boolean;
  send_email: boolean;
  starts_at: string;
  ends_at: string;
}

const emptyForm: AnnouncementForm = {
  title: '',
  message: '',
  level: 'info',
  audience: 'all',
  plan_id: '',
  organization_id: '',
  is_active: true,
  is_dismissible: true,
  send_email: false,
  starts_at: '',
  ends_at: '',
};

const toForm = (announcement: AdminAnnouncement): AnnouncementForm => ({
  title: announcement.title,
  message: announcement.message,
  level: announcement.level,
  audience: announcement.audience,
  plan_id: announcement.plan_id ? String(announcement.plan_id) : '',
  organization_id: announcement.organization_id ? String(announcement.organization_id) : '',
  is_active: announcement.is_active,
  is_dismissible: announcement.is_dismissible,
  send_email: announcement.send_email,
  starts_at: (announcement.starts_at ?? '').slice(0, 16).replace(' ', 'T'),
  ends_at: (announcement.ends_at ?? '').slice(0, 16).replace(' ', 'T'),
});

const AdminAnnouncementsPage = () => {
  const [announcements, setAnnouncements] = useState<AdminAnnouncement[]>([]);
  const [plans, setPlans] = useState<AdminPlan[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editor, setEditor] = useState<{ mode: 'create' | 'edit'; announcement?: AdminAnnouncement } | null>(null);
  const [form, setForm] = useState<AnnouncementForm>(emptyForm);
  const [deleting, setDeleting] = useState<AdminAnnouncement | null>(null);
  const [resending, setResending] = useState<AdminAnnouncement | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await adminService.getAnnouncements();
      setAnnouncements(response.data ?? []);
    } catch (e) {
      setError(getApiErrorMessage(e, 'Could not load announcements'));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    adminService
      .getPlans()
      .then((response) => setPlans(response.data.plans))
      .catch(() => setPlans([]));
  }, []);

  const save = async () => {
    if (!form.title.trim() || !form.message.trim()) {
      toastError('Title and message are required');
      return;
    }

    setIsSubmitting(true);
    const payload = {
      title: form.title,
      message: form.message,
      level: form.level,
      audience: form.audience,
      plan_id: form.audience === 'plan' ? form.plan_id : '',
      organization_id: form.audience === 'organization' ? form.organization_id : '',
      is_active: form.is_active ? 1 : 0,
      is_dismissible: form.is_dismissible ? 1 : 0,
      send_email: form.send_email ? 1 : 0,
      starts_at: form.starts_at ? form.starts_at.replace('T', ' ') + ':00' : '',
      ends_at: form.ends_at ? form.ends_at.replace('T', ' ') + ':00' : '',
    };

    try {
      if (editor?.mode === 'edit' && editor.announcement) {
        await adminService.updateAnnouncement(editor.announcement.id, payload);
        toastSuccess('Announcement updated');
      } else {
        const response = await adminService.createAnnouncement(payload);
        const delivery = (response?.data as AdminAnnouncement | undefined)?.delivery;
        toastSuccess(
          delivery
            ? `Published — ${formatNumber(delivery.notified)} in-app notifications, ${formatNumber(delivery.emailed)} emails`
            : 'Announcement published',
        );
      }
      setEditor(null);
      void load();
    } catch (e) {
      toastError(getApiErrorMessage(e, 'Could not save announcement'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const remove = async () => {
    if (!deleting) return;
    setIsSubmitting(true);
    try {
      await adminService.deleteAnnouncement(deleting.id);
      toastSuccess('Announcement deleted');
      setDeleting(null);
      void load();
    } catch (e) {
      toastError(getApiErrorMessage(e, 'Could not delete announcement'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const resend = async () => {
    if (!resending) return;
    setIsSubmitting(true);
    try {
      const response = await adminService.resendAnnouncement(resending.id);
      const delivery = (response?.data as { notified?: number; emailed?: number } | undefined) ?? {};
      toastSuccess(
        `Resent — ${formatNumber(delivery.notified ?? 0)} notifications, ${formatNumber(delivery.emailed ?? 0)} emails`,
      );
      setResending(null);
      void load();
    } catch (e) {
      toastError(getApiErrorMessage(e, 'Could not resend announcement'));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) return <PageSkeleton />;
  if (error) return <p className="text-sm text-rose-300">{error}</p>;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-white">Broadcasts</h2>
          <p className="text-sm text-slate-400">
            In-app banners plus optional email to every targeted organization. {announcements.length} total.
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => {
            setForm(emptyForm);
            setEditor({ mode: 'create' });
          }}
        >
          <Plus size={14} className="mr-2" /> New announcement
        </Button>
      </div>

      {announcements.length === 0 ? (
        <Card className="text-center py-14">
          <Megaphone size={28} className="mx-auto text-slate-600 mb-3" />
          <p className="text-sm text-slate-400">
            No announcements yet. Publish one to show a banner inside every tenant's workspace.
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {announcements.map((announcement) => {
            const meta = levelMeta(announcement.level);
            const Icon = meta.icon;
            return (
              <Card key={announcement.id} className="space-y-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 min-w-0">
                    <span className={`h-9 w-9 rounded-xl border flex items-center justify-center shrink-0 ${meta.className}`}>
                      <Icon size={16} />
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-sm font-bold text-white">{announcement.title}</h3>
                        {announcement.is_active ? <Badge variant="success">Live</Badge> : <Badge>Paused</Badge>}
                        <Badge variant="primary">
                          {announcement.audience === 'all'
                            ? 'everyone'
                            : announcement.audience === 'plan'
                              ? `plan: ${announcement.plan_name ?? announcement.plan_id}`
                              : `org: ${announcement.organization_name ?? announcement.organization_id}`}
                        </Badge>
                        {!announcement.is_dismissible && <Badge variant="warning">not dismissible</Badge>}
                      </div>
                      <p className="text-sm text-slate-300 mt-1 whitespace-pre-line">{announcement.message}</p>
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => setResending(announcement)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-primary-300 hover:bg-white/10"
                      aria-label="Resend"
                    >
                      <Send size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setForm(toForm(announcement));
                        setEditor({ mode: 'edit', announcement });
                      }}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10"
                      aria-label="Edit"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleting(announcement)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-300 hover:bg-rose-500/10"
                      aria-label="Delete"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-500 pt-2 border-t border-white/5">
                  <span>Created {formatRelative(announcement.created_at)}</span>
                  {announcement.created_by_email && <span>by {announcement.created_by_email}</span>}
                  {announcement.starts_at && <span>Starts {formatDateTime(announcement.starts_at)}</span>}
                  {announcement.ends_at && <span>Ends {formatDateTime(announcement.ends_at)}</span>}
                  <span>{formatNumber(announcement.dismissals)} dismissals</span>
                  {announcement.send_email && (
                    <span className="inline-flex items-center gap-1 text-slate-400">
                      <Mail size={11} />
                      {formatNumber(announcement.email_recipients)} emailed
                      {announcement.emailed_at ? ` ${formatRelative(announcement.emailed_at)}` : ''}
                    </span>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Modal
        open={editor !== null}
        onClose={() => setEditor(null)}
        title={editor?.mode === 'edit' ? 'Edit announcement' : 'New announcement'}
        size="lg"
      >
        <div className="space-y-4">
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-slate-400">Title</span>
            <input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="Scheduled maintenance on Saturday"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-primary-500/50"
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-slate-400">Message</span>
            <textarea
              value={form.message}
              onChange={(e) => setForm({ ...form, message: e.target.value })}
              rows={4}
              placeholder="We'll be upgrading the database between 02:00 and 03:00 UTC. Timers keep running; reports may be delayed."
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-primary-500/50"
            />
          </label>

          <div>
            <span className="text-xs font-medium text-slate-400 block mb-2">Severity</span>
            <div className="flex flex-wrap gap-2">
              {LEVELS.map((level) => {
                const Icon = level.icon;
                const active = form.level === level.value;
                return (
                  <button
                    key={level.value}
                    type="button"
                    onClick={() => setForm({ ...form, level: level.value })}
                    className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition-colors ${
                      active ? level.className : 'border-white/10 bg-white/5 text-slate-400 hover:text-white'
                    }`}
                  >
                    <Icon size={14} />
                    {level.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-slate-400">Audience</span>
              <select
                value={form.audience}
                onChange={(e) => setForm({ ...form, audience: e.target.value as AnnouncementForm['audience'] })}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-primary-500/50"
              >
                <option value="all" className="bg-[#12141C]">Every organization</option>
                <option value="plan" className="bg-[#12141C]">Specific plan</option>
                <option value="organization" className="bg-[#12141C]">Single organization</option>
              </select>
            </label>

            {form.audience === 'plan' && (
              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-slate-400">Plan</span>
                <select
                  value={form.plan_id}
                  onChange={(e) => setForm({ ...form, plan_id: e.target.value })}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-primary-500/50"
                >
                  <option value="" className="bg-[#12141C]">Select plan…</option>
                  {plans.map((plan) => (
                    <option key={plan.id} value={plan.id} className="bg-[#12141C]">
                      {plan.name}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {form.audience === 'organization' && (
              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-slate-400">Organization ID</span>
                <input
                  type="number"
                  value={form.organization_id}
                  onChange={(e) => setForm({ ...form, organization_id: e.target.value })}
                  placeholder="42"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-primary-500/50"
                />
              </label>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-slate-400">Starts at (optional)</span>
              <input
                type="datetime-local"
                value={form.starts_at}
                onChange={(e) => setForm({ ...form, starts_at: e.target.value })}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-primary-500/50"
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-slate-400">Ends at (optional)</span>
              <input
                type="datetime-local"
                value={form.ends_at}
                onChange={(e) => setForm({ ...form, ends_at: e.target.value })}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-primary-500/50"
              />
            </label>
          </div>

          <div className="flex flex-wrap gap-2">
            {[
              { key: 'is_active' as const, label: 'Active' },
              { key: 'is_dismissible' as const, label: 'Users can dismiss' },
              { key: 'send_email' as const, label: 'Also send email' },
            ].map((toggle) => (
              <button
                key={toggle.key}
                type="button"
                onClick={() => setForm({ ...form, [toggle.key]: !form[toggle.key] })}
                className={
                  form[toggle.key]
                    ? 'rounded-xl border border-emerald-500/30 bg-emerald-500/15 px-3 py-2 text-sm font-medium text-emerald-300'
                    : 'rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-400 hover:text-white'
                }
              >
                {toggle.label}
              </button>
            ))}
          </div>

          {form.send_email && (
            <p className="text-xs text-amber-300/90 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2">
              Emails go out immediately to every member of the targeted organizations. Double-check the message before saving.
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" size="sm" onClick={() => setEditor(null)}>
              Cancel
            </Button>
            <Button size="sm" isLoading={isSubmitting} onClick={() => void save()}>
              {editor?.mode === 'edit' ? 'Save changes' : 'Publish'}
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={resending !== null}
        title="Resend this announcement?"
        description="Everyone in the target audience gets the in-app notification again, plus an email if email delivery is enabled on this announcement."
        confirmLabel="Resend now"
        isLoading={isSubmitting}
        onConfirm={() => void resend()}
        onClose={() => setResending(null)}
      />

      <ConfirmDialog
        open={deleting !== null}
        title={`Delete "${deleting?.title ?? ''}"?`}
        description="The banner disappears for everyone. Notifications already delivered stay in users' inboxes."
        confirmLabel="Delete"
        destructive
        isLoading={isSubmitting}
        onConfirm={() => void remove()}
        onClose={() => setDeleting(null)}
      />
    </div>
  );
};

export default AdminAnnouncementsPage;
