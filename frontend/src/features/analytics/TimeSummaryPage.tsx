import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Calendar, ChevronLeft, ChevronRight, Clock, Loader2, Users } from 'lucide-react';
import { reportService, type HoursCalendar } from '../../api/reportService';
import { teamService } from '../../api/teamService';
import { useAuthStore } from '../../store/authStore';
import { hasPermission } from '../../utils/access';
import { getApiErrorMessage } from '../../utils/apiError';
import { PageSkeleton } from '../../components/ui';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

type UserFilter = 'me' | 'all' | number;

const TimeSummaryPage = () => {
  const user = useAuthStore((s) => s.user);
  const canViewTeam = hasPermission(user, 'reports.view_team');

  const now = useMemo(() => new Date(), []);
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [userFilter, setUserFilter] = useState<UserFilter>('me');
  const [teamMembers, setTeamMembers] = useState<
    { user_id: number; first_name: string; last_name: string }[]
  >([]);
  const [calendar, setCalendar] = useState<HoursCalendar | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!canViewTeam) return;
    teamService
      .getAll()
      .then((r) => {
        const rows = (r.data ?? []).map((m: Record<string, unknown>) => ({
          user_id: Number(m.user_id ?? m.id),
          first_name: String(m.first_name ?? ''),
          last_name: String(m.last_name ?? ''),
        }));
        setTeamMembers(rows.filter((m) => m.user_id > 0));
      })
      .catch(() => undefined);
  }, [canViewTeam]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: { year: number; month: number; user_id?: number | 'all' } = { year, month };
      if (canViewTeam) {
        if (userFilter === 'all') params.user_id = 'all';
        else if (userFilter === 'me') params.user_id = user?.id;
        else params.user_id = userFilter;
      }
      const resp = await reportService.getHoursCalendar(params);
      setCalendar(resp.data);
    } catch (e) {
      setError(getApiErrorMessage(e, 'Failed to load time summary'));
      setCalendar(null);
    } finally {
      setLoading(false);
    }
  }, [year, month, userFilter, canViewTeam, user?.id]);

  useEffect(() => {
    load();
  }, [load]);

  const shiftMonth = (delta: number) => {
    const d = new Date(year, month - 1 + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth() + 1);
  };

  const goCurrentMonth = () => {
    const d = new Date();
    setYear(d.getFullYear());
    setMonth(d.getMonth() + 1);
  };

  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1;

  if (loading && !calendar) {
    return <PageSkeleton />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white mb-1">Time Summary</h1>
          <p className="text-slate-400 text-sm">
            Month-wise logged hours
            {canViewTeam ? ' — yours, a teammate, or everyone you can view.' : ' for your account.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {canViewTeam && (
            <div className="flex items-center gap-2">
              <Users size={16} className="text-slate-500" />
              <select
                value={userFilter === 'me' || userFilter === 'all' ? userFilter : String(userFilter)}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === 'me' || v === 'all') setUserFilter(v);
                  else setUserFilter(Number(v));
                }}
                className="bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-sm text-slate-200 outline-none focus:border-primary-500/50"
              >
                <option value="me">My time</option>
                <option value="all">All users</option>
                {teamMembers
                  .filter((m) => m.user_id !== user?.id)
                  .map((m) => (
                    <option key={m.user_id} value={m.user_id}>
                      {m.first_name} {m.last_name}
                    </option>
                  ))}
              </select>
            </div>
          )}

          <div className="flex items-center gap-1 bg-white/5 border border-white/10 rounded-xl px-1 py-1">
            <button
              type="button"
              onClick={() => shiftMonth(-1)}
              className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-white/10"
              aria-label="Previous month"
            >
              <ChevronLeft size={18} />
            </button>
            <div className="flex items-center gap-2 px-3 min-w-[140px] justify-center">
              <Calendar size={16} className="text-primary-400" />
              <span className="text-sm font-semibold text-white">
                {calendar?.month_label ?? `${year}-${month}`}
              </span>
            </div>
            <button
              type="button"
              onClick={() => shiftMonth(1)}
              className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-white/10"
              aria-label="Next month"
            >
              <ChevronRight size={18} />
            </button>
          </div>

          {!isCurrentMonth && (
            <button
              type="button"
              onClick={goCurrentMonth}
              className="text-xs font-bold text-primary-400 hover:underline px-2"
            >
              This month
            </button>
          )}
        </div>
      </div>

      {error && <p className="text-rose-400 text-sm">{error}</p>}

      {loading && calendar && (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 size={14} className="animate-spin" /> Updating…
        </div>
      )}

      {calendar && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          {/* Total donut-style summary */}
          <div className="xl:col-span-3 glass rounded-3xl border border-white/5 p-6 flex flex-col items-center text-center">
            <div className="relative w-40 h-40 rounded-full border-[10px] border-primary-500/30 flex flex-col items-center justify-center mb-4">
              <div className="absolute inset-0 rounded-full border-[10px] border-transparent border-t-primary-500 border-r-secondary-400 opacity-90" />
              <p className="text-2xl font-bold text-white font-mono relative z-10">{calendar.hours_label} h</p>
              <p className="text-[11px] text-slate-500 relative z-10">
                {calendar.project_count} project{calendar.project_count === 1 ? '' : 's'}
              </p>
            </div>
            <p className="text-sm text-slate-400">
              Total time: <span className="text-white font-mono font-semibold">{calendar.hours_label} h</span>
            </p>
            <Link
              to="/timesheets"
              className="mt-4 text-sm font-semibold text-primary-400 hover:underline"
            >
              Full timesheet →
            </Link>
          </div>

          {/* Month calendar */}
          <div className="xl:col-span-6 glass rounded-3xl border border-white/5 p-4 sm:p-6">
            <div className="grid grid-cols-7 gap-1 mb-2">
              {WEEKDAYS.map((d) => (
                <div key={d} className="text-center text-[10px] font-bold uppercase tracking-wider text-slate-500 py-1">
                  {d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {calendar.days.map((day) => (
                <div
                  key={day.date}
                  className={`min-h-[64px] sm:min-h-[72px] rounded-xl p-1.5 sm:p-2 border transition-colors ${
                    !day.in_month
                      ? 'border-transparent opacity-30'
                      : day.is_today
                        ? 'border-emerald-500/40 bg-emerald-500/10'
                        : day.seconds > 0
                          ? 'border-white/10 bg-white/[0.03] hover:bg-white/[0.06]'
                          : 'border-white/5 bg-transparent'
                  }`}
                >
                  <div className="flex justify-end">
                    <span
                      className={`text-[10px] font-bold ${
                        day.is_today ? 'text-emerald-400' : 'text-slate-500'
                      }`}
                    >
                      {day.day}
                    </span>
                  </div>
                  {day.in_month && (
                    <p
                      className={`mt-1 text-xs sm:text-sm font-mono font-semibold ${
                        day.seconds > 0 ? 'text-white' : 'text-slate-600'
                      }`}
                    >
                      {day.hours_label}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Week totals + projects */}
          <div className="xl:col-span-3 space-y-4">
            <div className="glass rounded-3xl border border-white/5 p-5 space-y-3">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Weekly totals</p>
              {calendar.weeks.map((week) => (
                <div
                  key={week.week_index}
                  className="flex items-center justify-between gap-3 py-2 border-b border-white/5 last:border-0"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-full border-2 border-primary-500/40 flex items-center justify-center shrink-0">
                      <Clock size={14} className="text-primary-400" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-mono font-bold text-white">{week.hours_label} h</p>
                      <p className="text-[10px] text-slate-500 truncate">
                        Week {week.week_index} · {week.project_count} project
                        {week.project_count === 1 ? '' : 's'}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
              {calendar.weeks.length === 0 && (
                <p className="text-xs text-slate-500">No weeks in this month.</p>
              )}
            </div>

            <div className="glass rounded-3xl border border-white/5 p-5 space-y-3">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Projects this month</p>
              {calendar.projects.length === 0 ? (
                <p className="text-xs text-slate-500">No logged projects.</p>
              ) : (
                calendar.projects.slice(0, 8).map((p) => (
                  <div key={p.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="text-slate-300 truncate">{p.name}</span>
                    <span className="font-mono text-white shrink-0">{p.hours_label} h</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TimeSummaryPage;
