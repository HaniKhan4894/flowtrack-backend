import { useState, useEffect, useCallback } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Loader2,
  Send,
  Clock,
} from 'lucide-react';
import { Button, Modal } from '../../components/ui';
import { timesheetService } from '../../api/timesheetService';
import { teamService } from '../../api/teamService';
import { useAuthStore } from '../../store/authStore';
import { hasPermission } from '../../utils/access';
import { getApiErrorMessage } from '../../utils/apiError';
import type { TimesheetWeekGrid } from '../../types';

const formatDuration = (seconds: number) => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
};

const dayLabel = (dateStr: string) => {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
};

const TimesheetsPage = () => {
  const { user } = useAuthStore();
  const canApprove = hasPermission(user, 'timesheet.approve');

  const [grid, setGrid] = useState<TimesheetWeekGrid | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedUserId, setSelectedUserId] = useState<number | ''>('');
  const [teamMembers, setTeamMembers] = useState<any[]>([]);
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectModal, setShowRejectModal] = useState(false);

  const loadGrid = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: { user_id?: number; week_start?: string } = {};
      if (canApprove && selectedUserId) params.user_id = Number(selectedUserId);

      if (weekOffset !== 0) {
        const d = new Date();
        d.setDate(d.getDate() + weekOffset * 7);
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1);
        d.setDate(diff);
        params.week_start = d.toISOString().split('T')[0];
      }

      const resp = await timesheetService.getCurrentWeek(params);
      setGrid(resp.data);
    } catch (e) {
      setError(getApiErrorMessage(e, 'Failed to load timesheet'));
      setGrid(null);
    } finally {
      setLoading(false);
    }
  }, [canApprove, selectedUserId, weekOffset]);

  useEffect(() => {
    if (canApprove) {
      teamService.getAll().then((r) => setTeamMembers(r.data ?? [])).catch(() => undefined);
    }
  }, [canApprove]);

  useEffect(() => {
    loadGrid();
  }, [loadGrid]);

  const handleSubmit = async () => {
    if (!grid?.period?.id) return;
    setActionLoading(true);
    try {
      await timesheetService.submit(grid.period.id);
      await loadGrid();
    } catch (e) {
      setError(getApiErrorMessage(e, 'Failed to submit timesheet'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleApprove = async () => {
    if (!grid?.period?.id) return;
    setActionLoading(true);
    try {
      await timesheetService.approve(grid.period.id);
      await loadGrid();
    } catch (e) {
      setError(getApiErrorMessage(e, 'Failed to approve timesheet'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async () => {
    if (!grid?.period?.id || !rejectReason.trim()) return;
    setActionLoading(true);
    try {
      await timesheetService.reject(grid.period.id, rejectReason.trim());
      setShowRejectModal(false);
      setRejectReason('');
      await loadGrid();
    } catch (e) {
      setError(getApiErrorMessage(e, 'Failed to reject timesheet'));
    } finally {
      setActionLoading(false);
    }
  };

  const status = grid?.period?.status ?? 'draft';
  const isOwnTimesheet = !selectedUserId || Number(selectedUserId) === user?.id;
  const canSubmit = isOwnTimesheet && (status === 'draft' || status === 'rejected');
  const canReview = canApprove && !isOwnTimesheet && status === 'submitted';

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Timesheets</h1>
          <p className="text-slate-400">Weekly time summary with submit and approval workflow.</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {canApprove && (
            <select
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value ? Number(e.target.value) : '')}
              className="bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-sm text-slate-300 outline-none focus:border-primary-500/50"
            >
              <option value="">My timesheet</option>
              {teamMembers
                .filter((m) => m.user_id !== user?.id && m.id !== user?.id)
                .map((m) => (
                  <option key={m.user_id ?? m.id} value={m.user_id ?? m.id}>
                    {m.first_name} {m.last_name}
                  </option>
                ))}
            </select>
          )}

          <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-2 py-1">
            <button
              onClick={() => setWeekOffset((o) => o - 1)}
              className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-white/10"
            >
              <ChevronLeft size={18} />
            </button>
            <span className="text-sm text-white font-medium px-2 min-w-[140px] text-center">
              {grid ? `${dayLabel(grid.week_start)} – ${dayLabel(grid.week_end)}` : 'Loading…'}
            </span>
            <button
              onClick={() => setWeekOffset((o) => o + 1)}
              className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-white/10"
            >
              <ChevronRight size={18} />
            </button>
            {weekOffset !== 0 && (
              <button
                onClick={() => setWeekOffset(0)}
                className="text-xs font-bold text-primary-400 hover:underline px-2"
              >
                Today
              </button>
            )}
          </div>
        </div>
      </div>

      {error && <p className="text-rose-400 text-sm">{error}</p>}

      <div className="glass rounded-3xl border border-white/5 overflow-hidden">
        <div className="p-6 border-b border-white/5 flex flex-wrap items-center justify-between gap-4 bg-white/[0.02]">
          <div className="flex items-center gap-4">
            <div className="h-10 w-10 rounded-xl bg-primary-500/10 flex items-center justify-center text-primary-400">
              <Clock size={20} />
            </div>
            <div>
              <p className="text-sm text-slate-400">Total this week</p>
              <p className="text-2xl font-bold text-white font-mono">
                {grid ? formatDuration(grid.total_seconds) : '—'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className={`text-xs font-bold uppercase tracking-wider px-3 py-1.5 rounded-full border ${
              status === 'approved'
                ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                : status === 'submitted'
                  ? 'text-primary-400 bg-primary-500/10 border-primary-500/20'
                  : status === 'rejected'
                    ? 'text-rose-400 bg-rose-500/10 border-rose-500/20'
                    : 'text-slate-400 bg-white/5 border-white/10'
            }`}>
              {status}
            </span>

            {canSubmit && (
              <Button onClick={handleSubmit} isLoading={actionLoading} className="!rounded-xl">
                <Send size={16} className="mr-2" />
                Submit
              </Button>
            )}

            {canReview && (
              <>
                <Button onClick={handleApprove} isLoading={actionLoading} className="!rounded-xl">
                  <CheckCircle2 size={16} className="mr-2" />
                  Approve
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => setShowRejectModal(true)}
                  disabled={actionLoading}
                  className="!rounded-xl"
                >
                  <XCircle size={16} className="mr-2" />
                  Reject
                </Button>
              </>
            )}
          </div>
        </div>

        {loading ? (
          <div className="p-20 flex justify-center">
            <Loader2 className="w-8 h-8 text-primary-500 animate-spin" />
          </div>
        ) : grid ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-white/5 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                  <th className="px-6 py-4">Day</th>
                  <th className="px-6 py-4">Hours</th>
                  <th className="px-6 py-4">Entries</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {grid.days.map((day) => (
                  <tr key={day.date} className="hover:bg-white/[0.02]">
                    <td className="px-6 py-4 text-sm font-medium text-white">{dayLabel(day.date)}</td>
                    <td className="px-6 py-4 text-sm font-mono text-primary-400">
                      {formatDuration(day.total_seconds)}
                    </td>
                    <td className="px-6 py-4">
                      {day.entries.length === 0 ? (
                        <span className="text-xs text-slate-500">No entries</span>
                      ) : (
                        <div className="space-y-1">
                          {day.entries.map((entry) => (
                            <div key={entry.id} className="text-xs text-slate-300">
                              <span className="text-white font-medium">
                                {entry.description || 'No description'}
                              </span>
                              <span className="text-slate-500 ml-2">
                                {(entry as any).project_name || 'General'} · {formatDuration(entry.duration_seconds || 0)}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-20 text-center text-slate-400">No timesheet data available.</div>
        )}
      </div>

      <Modal
        open={showRejectModal}
        onClose={() => setShowRejectModal(false)}
        title="Reject timesheet"
        size="sm"
      >
        <div className="space-y-4">
          <textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Reason for rejection (required)"
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none min-h-24"
          />
          <div className="flex gap-3">
            <Button variant="secondary" className="flex-1" onClick={() => setShowRejectModal(false)}>
              Cancel
            </Button>
            <Button className="flex-1" onClick={handleReject} isLoading={actionLoading} disabled={!rejectReason.trim()}>
              Reject
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default TimesheetsPage;
