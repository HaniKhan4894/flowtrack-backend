import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { timeService } from '../../api/timeService';
import { projectService, type Project } from '../../api/projectService';
import { getApiErrorMessage } from '../../utils/apiError';
import { toastError, toastSuccess } from '../../store/toastStore';
import { Button, Input } from '../../components/ui';

interface Props {
  open: boolean;
  onClose: () => void;
  selectedDate: string;
  onSaved: () => void;
}

export function TrackerAddEntryModal({ open, onClose, selectedDate, onSaved }: Props) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [description, setDescription] = useState('');
  const [projectId, setProjectId] = useState<string>('');
  const [startedAt, setStartedAt] = useState('');
  const [endedAt, setEndedAt] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setDescription('');
    setStartedAt(`${selectedDate}T09:00`);
    setEndedAt(`${selectedDate}T10:00`);
    setError(null);
    void projectService.getAll({ is_active: 1, per_page: 200 }).then((resp) => {
      const list = resp.data ?? [];
      setProjects(list);
      setProjectId(list[0]?.id ? String(list[0].id) : '');
    }).catch(() => setProjects([]));
  }, [open, selectedDate]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!startedAt || !endedAt) {
      setError('Start and end time are required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await timeService.createManual({
        project_id: projectId ? Number(projectId) : undefined,
        description: description.trim() || undefined,
        started_at: startedAt.replace('T', ' ') + ':00',
        ended_at: endedAt.replace('T', ' ') + ':00',
        is_billable: true,
      });
      toastSuccess('Entry added');
      onSaved();
      onClose();
    } catch (err) {
      const msg = getApiErrorMessage(err, 'Failed to add entry');
      setError(msg);
      toastError(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-3 sm:items-center" onClick={onClose}>
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={{ duration: 0.2 }}
            className="w-full max-w-md rounded-2xl border border-white/10 bg-[#141824] shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <h2 className="text-sm font-semibold text-white">Add time entry</h2>
              <button type="button" onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-white/5 hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={(e) => void handleSave(e)} className="space-y-3 p-4">
              {error && (
                <p className="rounded-lg border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">{error}</p>
              )}
              <Input
                label="Description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What did you work on?"
              />
              {projects.length > 0 && (
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-400">Project</label>
                  <select
                    value={projectId}
                    onChange={(e) => setProjectId(e.target.value)}
                    className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white"
                  >
                    <option value="">No project</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-400">Start</label>
                  <input
                    type="datetime-local"
                    value={startedAt}
                    onChange={(e) => setStartedAt(e.target.value)}
                    required
                    className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-2 py-2 text-xs text-white"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-400">End</label>
                  <input
                    type="datetime-local"
                    value={endedAt}
                    onChange={(e) => setEndedAt(e.target.value)}
                    required
                    className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-2 py-2 text-xs text-white"
                  />
                </div>
              </div>
              <Button type="submit" className="w-full" isLoading={saving}>
                Save entry
              </Button>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
