import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Calendar, ChevronLeft, ChevronRight, Clock, Loader2, Users } from 'lucide-react';
import { reportService, type HoursCalendar } from '../../api/reportService';
import { teamService } from '../../api/teamService';
import { useAuthStore } from '../../store/authStore';
import { useLiveSessionForUser } from '../../hooks/useLiveSessionForUser';
import { hasPermission } from '../../utils/access';
import { getApiErrorMessage } from '../../utils/apiError';
import { formatDurationHms, localDateKey } from '../../utils/liveTimer';
import { PageSkeleton } from '../../components/ui';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

type UserFilter = 'me' | 'all' | number;

function addLiveToCalendar(calendar: HoursCalendar, liveSeconds: number): HoursCalendar {
  if (liveSeconds <= 0) return calendar;
  const today = localDateKey();
  if (today < calendar.start_date || today > calendar.end_date) return calendar;

  const days = calendar.days.map((day) => {
    if (!day.in_month || day.date !== today) return day;
    const seconds = day.seconds + liveSeconds;
    return {
      ...day,
      seconds,
      hours_label: formatHoursLabel(seconds),
    };
  });

  const weeks = calendar.weeks.map((week) => {
    if (today < week.start_date || today > week.end_date) return week;
    const seconds = week.seconds + liveSeconds;
    return {
      ...week,
      seconds,
      hours_label: formatHoursLabel(seconds),
    };
  });

  const total = calendar.total_seconds + liveSeconds;
  return {
    ...calendar,
    days,
    weeks,
    total_seconds: total,
    hours_label: formatHoursLabel(total),
  };
}

function formatHoursLabel(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}:${String(m).padStart(2, '0')}`;
}

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

  const liveTargetUserId =
    userFilter === 'all'
      ? null
      : userFilter === 'me'
        ? (user?.id ?? null)
        : userFilter;

  const isCurrentMonthView = year === now.getFullYear() && month === now.getMonth() + 1;
  const live = useLiveSessionForUser(liveTargetUserId, {
    enabled: isCurrentMonthView && liveTargetUserId != null,
  });

  useEffect(() => {
    if (!canViewTeam) return;
    teamService
      .getAll()
      .then((r) => {
        const rows = (r.data ?? []).map((m) => ({
          user_id: Number(m.user_id ?? m.id),
          first_name: m.first_name ?? '',
          last_name: m.last_name ?? '',
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

  const displayCalendar = useMemo(() => {
    if (!calendar) return null;
    if (!live.isRunning || live.elapsed <= 0) return calendar;
    return addLiveToCalendar(calendar, live.elapsed);
  }, [calendar, live.isRunning, live.elapsed]);

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
                className="form-select h-10 min-w-[200px] text-sm"
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

      {displayCalendar && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          {/* Total donut-style summary */}
          <div className="xl:col-span-3 glass rounded-3xl border border-white/5 p-6 flex flex-col items-center text-center">
            <div className="relative w-40 h-40 rounded-full border-[10px] border-primary-500/30 flex flex-col items-center justify-center mb-4">
              <div className="absolute inset-0 rounded-full border-[10px] border-transparent border-t-primary-500 border-r-secondary-400 opacity-90" />
              <p className="text-2xl font-bold text-white font-mono relative z-10">
                {live.isRunning ? formatDurationHms(displayCalendar.total_seconds) : `${displayCalendar.hours_label} h`}
              </p>
              <p className="text-[11px] text-slate-500 relative z-10">
                {displayCalendar.project_count} project{displayCalendar.project_count === 1 ? '' : 's'}
                {live.isRunning && <span className="text-emerald-400"> · Live</span>}
              </p>
            </div>
            <p className="text-sm text-slate-400">
              Total time:{' '}
              <span className="text-white font-mono font-semibold">
                {live.isRunning ? formatDurationHms(displayCalendar.total_seconds) : `${displayCalendar.hours_label} h`}
              </span>
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
              {displayCalendar.days.map((day) => {
                const dayLive = live.isRunning && day.is_today && day.in_month;
                return (
                <div
                  key={day.date}
                  className={`min-h-[64px] sm:min-h-[72px] rounded-xl p-1.5 sm:p-2 border transition-colors ${
                    !day.in_month
                      ? 'border-transparent opacity-30'
                      : dayLive || day.is_today
                        ? 'border-emerald-500/40 bg-emerald-500/10'
                        : day.seconds > 0
                          ? 'border-white/10 bg-white/[0.03] hover:bg-white/[0.06]'
                          : 'border-white/5 bg-transparent'
                  }`}
                >
                  <div className="flex justify-between items-start">
                    {dayLive ? (
                      <span className="text-[9px] font-bold uppercase text-emerald-400">Live</span>
                    ) : (
                      <span />
                    )}
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
                        dayLive ? 'text-emerald-400' : day.seconds > 0 ? 'text-white' : 'text-slate-600'
                      }`}
                    >
                      {dayLive ? formatDurationHms(day.seconds) : day.hours_label}
                    </p>
                  )}
                </div>
                );
              })}
            </div>
          </div>

          {/* Week totals + projects */}
          <div className="xl:col-span-3 space-y-4">
            <div className="glass rounded-3xl border border-white/5 p-5 space-y-3">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Weekly totals</p>
              {displayCalendar.weeks.map((week) => (
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
              {displayCalendar.weeks.length === 0 && (
                <p className="text-xs text-slate-500">No weeks in this month.</p>
              )}
            </div>

            <div className="glass rounded-3xl border border-white/5 p-5 space-y-3">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Projects this month</p>
              {displayCalendar.projects.length === 0 ? (
                <p className="text-xs text-slate-500">No logged projects.</p>
              ) : (
                displayCalendar.projects.slice(0, 8).map((p) => (
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
