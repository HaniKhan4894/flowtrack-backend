import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ExternalLink, LogOut, Pause, Play, Plus, RefreshCw, Settings, Square, User } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { useAuthStore } from '../../store/authStore';
import { useTimerStore } from '../../store/timerStore';
import { projectService, type Project } from '../../api/projectService';
import { taskService } from '../../api/taskService';
import type { Task } from '../../types';
import { formatDurationHms, localDateKey } from '../../utils/liveTimer';
import { getApiErrorMessage } from '../../utils/apiError';
import { toastError, toastSuccess } from '../../store/toastStore';
import { hardRedirectToLogin, openWebAppInBrowser } from '../../utils/electronAuth';
import { canAccessScreenshotsPage } from '../../utils/access';
import { reportService } from '../../api/reportService';
import { Avatar } from '../../components/ui/Avatar';
import { TrackerDailySummaryTab } from './TrackerDailySummaryTab';
import { TrackerWeekStrip, getWeekStartDate } from './TrackerWeekStrip';
import { useWeekEntryTotals } from '../../hooks/useWeekEntryTotals';
import { TrackerTimesheetTab } from './TrackerTimesheetTab';
import { TrackerScreenshotsTab } from './TrackerScreenshotsTab';
import { TrackerSettingsModal } from './TrackerSettingsModal';
import { TrackerAddEntryModal } from './TrackerAddEntryModal';
import { TrackerOfflineOverlay } from './TrackerOfflineOverlay';
import { formatClockShort } from './trackerMetrics';
import { cn } from '../../lib/cn';
import { useLiveActivity } from '../../hooks/useLiveActivity';
import { useConnectivity } from '../../hooks/useConnectivity';

type TabId = 'summary' | 'timesheet' | 'screenshots';

const ALL_TABS: { id: TabId; label: string }[] = [
  { id: 'summary', label: 'Summary' },
  { id: 'timesheet', label: 'Timesheet' },
  { id: 'screenshots', label: 'Screenshots' },
];

type ControlVariant = 'play' | 'pause' | 'stop';

const controlVariantClass: Record<ControlVariant, string> = {
  play: 'border-emerald-500/45 bg-emerald-500/12 text-emerald-300 hover:border-emerald-400/55 hover:bg-emerald-500/22',
  pause: 'border-amber-500/45 bg-amber-500/12 text-amber-300 hover:border-amber-400/55 hover:bg-amber-500/22',
  stop: 'border-rose-500/45 bg-rose-500/12 text-rose-300 hover:border-rose-400/55 hover:bg-rose-500/22',
};

function TrackerControlBtn({
  onClick,
  title,
  children,
  disabled,
  variant = 'play',
}: {
  onClick: () => void;
  title: string;
  children: React.ReactNode;
  disabled?: boolean;
  variant?: ControlVariant;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        'flex h-10 w-10 shrink-0 items-center justify-center rounded-full border transition-all active:scale-95',
        controlVariantClass[variant],
        'disabled:pointer-events-none disabled:opacity-0',
      )}
    >
      {children}
    </button>
  );
}

export function DesktopTrackerPage() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  const activeEntry = useTimerStore((s) => s.activeEntry);
  const isRunning = useTimerStore((s) => s.isRunning);
  const isPaused = useTimerStore((s) => s.isPaused);
  const elapsed = useTimerStore((s) => s.elapsed);
  const start = useTimerStore((s) => s.start);
  const stop = useTimerStore((s) => s.stop);
  const pause = useTimerStore((s) => s.pause);
  const resume = useTimerStore((s) => s.resume);
  const loadActive = useTimerStore((s) => s.loadActive);
  const syncOfflineSession = useTimerStore((s) => s.syncOfflineSession);

  const today = localDateKey();
  const [selectedDate, setSelectedDate] = useState(today);
  const [weekOffset, setWeekOffset] = useState(0);
  const [tab, setTab] = useState<TabId>('summary');
  const [showSettings, setShowSettings] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [description, setDescription] = useState('');
  const [showProjectSelect, setShowProjectSelect] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [idleNotice, setIdleNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [todayLoggedSeconds, setTodayLoggedSeconds] = useState(0);
  const [showAddEntry, setShowAddEntry] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  const isOnline = useConnectivity();
  const liveActivity = useLiveActivity(isRunning);
  const { sumsByDate: weekSumsByDate } = useWeekEntryTotals(
    weekOffset,
    refreshToken,
    activeEntry,
    isRunning,
    elapsed,
  );
  const brandName = user?.organization?.name ?? `${user?.first_name ?? ''} ${user?.last_name ?? ''}`.trim();

  const showScreenshots = canAccessScreenshotsPage(user);
  const tabs = useMemo(
    () => ALL_TABS.filter((t) => t.id !== 'screenshots' || showScreenshots),
    [showScreenshots],
  );

  const isTodaySelected = selectedDate === today;

  useEffect(() => {
    if (tab === 'screenshots' && !showScreenshots) {
      setTab('summary');
    }
  }, [tab, showScreenshots]);

  const handleSelectDate = useCallback((dateKey: string) => {
    setSelectedDate(dateKey);
    const weekStart = getWeekStartDate(0);
    const picked = new Date(`${dateKey}T12:00:00`);
    const diffDays = Math.round((picked.getTime() - weekStart.getTime()) / (24 * 60 * 60 * 1000));
    setWeekOffset(Math.floor(diffDays / 7));
  }, []);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadActive();
    setRefreshToken((n) => n + 1);
    window.setTimeout(() => setRefreshing(false), 400);
  }, [loadActive]);

  useEffect(() => {
    void loadActive();
  }, [loadActive]);

  useEffect(() => {
    let cancelled = false;
    const d = new Date();
    void reportService.getHoursCalendar({ year: d.getFullYear(), month: d.getMonth() + 1 }).then((resp) => {
      if (cancelled) return;
      const row = resp.data.days.find((day) => day.date === today);
      setTodayLoggedSeconds(row?.seconds ?? 0);
    }).catch(() => {
      if (!cancelled) setTodayLoggedSeconds(0);
    });
    return () => { cancelled = true; };
  }, [refreshToken, today]);

  const displayTodayLogged = Math.max(todayLoggedSeconds, weekSumsByDate[today] ?? 0);
  const selectedDayLogged = Math.max(weekSumsByDate[selectedDate] ?? 0, isTodaySelected ? displayTodayLogged : 0);

  // When back online, flush any offline timer session and activity queue.
  useEffect(() => {
    if (!isOnline) return;
    void syncOfflineSession();
  }, [isOnline, syncOfflineSession]);

  // Auto-refresh summary every 65 s while the timer is running so the hourly
  // breakdown always reflects recently-synced activity (sync cycle is ~60 s).
  useEffect(() => {
    if (!isRunning) return;
    const id = setInterval(() => {
      setRefreshToken((n) => n + 1);
    }, 65_000);
    return () => clearInterval(id);
  }, [isRunning]);

  const liveSessionApps = useMemo(
    () => (liveActivity?.session_apps ?? []).map((a) => ({
      app_name: a.app_name,
      duration_seconds: a.duration_seconds,
      percentage: a.percentage,
    })),
    [liveActivity?.session_apps],
  );

  useEffect(() => {
    if (!showUserMenu) return;
    const onPointerDown = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setShowUserMenu(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [showUserMenu]);

  useEffect(() => {
    const onIdle = (event: Event) => {
      const detail = (event as CustomEvent<{ message?: string }>).detail;
      if (detail?.message) {
        setIdleNotice(detail.message);
        window.setTimeout(() => setIdleNotice(null), 12000);
      }
    };
    window.addEventListener('flowtrack-idle-notice', onIdle);
    return () => window.removeEventListener('flowtrack-idle-notice', onIdle);
  }, []);

  const fetchProjects = useCallback(async () => {
    try {
      const resp = await projectService.getAll({ is_active: 1, per_page: 200 });
      const list = (resp.data ?? []).map((p) => ({ ...p, id: Number(p.id) }));
      setProjects(list);
      if (list.length > 0) {
        setSelectedProjectId((prev) => (prev && list.some((p) => p.id === prev) ? prev : list[0].id));
      }
    } catch {
      setProjects([]);
    }
  }, []);

  useEffect(() => {
    void fetchProjects();
  }, [fetchProjects]);

  useEffect(() => {
    if (!selectedProjectId) {
      setTasks([]);
      setSelectedTaskId(null);
      return;
    }
    void taskService.getAll({ project_id: selectedProjectId, is_active: 1 }).then((resp) => {
      setTasks(resp.data ?? []);
      setSelectedTaskId(null);
    }).catch(() => setTasks([]));
  }, [selectedProjectId]);

  const handlePrimaryAction = async () => {
    setActionError(null);
    try {
      if (isRunning) {
        await stop();
        toastSuccess('Timer stopped');
      } else {
        await start(selectedProjectId, description, selectedTaskId ?? undefined);
        toastSuccess(isOnline ? 'Timer started' : 'Timer started offline — will sync when online');
      }
    } catch (e) {
      const msg = getApiErrorMessage(e, 'Timer action failed');
      setActionError(msg);
      toastError(msg);
    }
  };

  const handlePauseResume = async () => {
    setActionError(null);
    try {
      if (isPaused) {
        await resume();
        toastSuccess('Timer resumed');
      } else {
        await pause();
        toastSuccess('Timer paused');
      }
    } catch (e) {
      toastError(getApiErrorMessage(e, 'Timer action failed'));
    }
  };

  const handleSignOut = async () => {
    await logout();
    hardRedirectToLogin();
  };

  const [nowLabel, setNowLabel] = useState(() =>
    new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }),
  );
  useEffect(() => {
    const id = setInterval(
      () => setNowLabel(new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })),
      60_000,
    );
    return () => clearInterval(id);
  }, []);

  const selectedDateShort = new Date(`${today}T12:00:00`).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#080B14] text-white pt-7">
      {/* subtle mesh */}
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(56,189,248,0.07),transparent_55%),radial-gradient(ellipse_at_bottom_right,_rgba(139,92,246,0.06),transparent_50%)]" />
      {/* ── Static top: timer through tabs ── */}
      <div className="relative z-20 shrink-0">
        <header className="mx-3 mt-1 rounded-2xl border border-white/[0.06] bg-white/[0.03] px-3 pb-2.5 pt-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-sm">
          <div className="flex items-center justify-between gap-2">
            <Avatar
              name={brandName || 'FlowTrack'}
              src={user?.avatar_url}
              size="sm"
              className="rounded-full"
            />

            <div className="flex items-center justify-center">
              <div className="flex items-center gap-2 rounded-2xl border border-white/[0.08] bg-white/[0.03] px-2 py-1.5">
                <TrackerControlBtn
                  onClick={() => void handlePauseResume()}
                  title={isPaused ? 'Resume' : 'Pause'}
                  disabled={!isRunning}
                  variant={isPaused ? 'play' : 'pause'}
                >
                  {isPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                </TrackerControlBtn>

                <div className="min-w-[96px] px-1 text-center">
                  <div className={cn(
                    'font-mono text-2xl font-bold tabular-nums tracking-tight transition-all',
                    isRunning && !isPaused ? 'text-sky-300 drop-shadow-[0_0_14px_rgba(56,189,248,0.35)]' : 'text-white',
                  )}>
                    {formatDurationHms(isRunning ? elapsed : 0)}
                  </div>
                  {!isRunning && displayTodayLogged > 0 && (
                    <p className="text-[10px] text-slate-400">
                      Today · <span className="font-semibold text-slate-300">{formatClockShort(displayTodayLogged)}</span>
                    </p>
                  )}
                  {!isRunning && displayTodayLogged <= 0 && (
                    <p className="text-[10px] text-slate-500">Tap play to start</p>
                  )}
                  {isRunning && activeEntry?.description && (
                    <p className="max-w-[160px] truncate text-[10px] text-slate-500">{activeEntry.description}</p>
                  )}
                </div>

                <TrackerControlBtn
                  onClick={() => void handlePrimaryAction()}
                  title={isRunning ? 'Stop' : 'Start'}
                  variant={isRunning ? 'stop' : 'play'}
                >
                  {isRunning ? <Square className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                </TrackerControlBtn>
              </div>
            </div>

            <div className="relative shrink-0" ref={userMenuRef}>
              <button
                type="button"
                onClick={() => setShowUserMenu((v) => !v)}
                aria-expanded={showUserMenu}
                aria-haspopup="menu"
                className={cn(
                  'flex h-8 items-center gap-0.5 rounded-full border pl-2 pr-1.5 transition-colors',
                  showUserMenu
                    ? 'border-sky-400/40 bg-sky-500/10 text-white'
                    : 'border-white/10 bg-white/5 text-slate-300 hover:text-white',
                )}
              >
                <User className="h-4 w-4" />
                <ChevronDown className={cn('h-3 w-3 text-slate-400 transition-transform', showUserMenu && 'rotate-180 text-sky-300')} />
              </button>
              <AnimatePresence>
                {showUserMenu && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    className="absolute right-0 top-full z-[200] mt-2 w-44 overflow-hidden rounded-xl border border-white/10 bg-[#141824] shadow-xl"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setShowUserMenu(false);
                        setShowSettings(true);
                      }}
                      className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-slate-300 hover:bg-white/5"
                    >
                      <Settings className="h-4 w-4" />
                      Settings
                    </button>
                    <button
                      type="button"
                      onClick={() => void openWebAppInBrowser()}
                      className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-slate-300 hover:bg-white/5"
                    >
                      <ExternalLink className="h-4 w-4" />
                      Web app
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleSignOut()}
                      className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-slate-300 hover:bg-white/5"
                    >
                      <LogOut className="h-4 w-4" />
                      Sign out
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {(idleNotice || actionError) && (
            <p className={cn(
              'mt-1 truncate text-center text-[10px]',
              actionError ? 'text-rose-400' : 'text-amber-300',
            )}>
              {actionError ?? idleNotice}
            </p>
          )}

          {!isRunning && (
            <div className="mt-1.5 flex gap-1.5">
              <div className="relative min-w-0 flex-1">
                <button
                  type="button"
                  onClick={() => setShowProjectSelect((v) => !v)}
                  className="flex w-full items-center justify-between rounded-md border border-white/10 bg-white/[0.03] px-2 py-1 text-[10px] text-slate-400"
                >
                  <span className="truncate">{projects.find((p) => p.id === selectedProjectId)?.name || 'No project'}</span>
                  <ChevronDown className="h-3 w-3 shrink-0" />
                </button>
                <AnimatePresence>
                  {showProjectSelect && (
                    <motion.div
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 4 }}
                      className="absolute z-40 mt-1 max-h-32 w-full overflow-y-auto rounded-lg border border-white/10 bg-[#141824] shadow-xl"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedProjectId(null);
                          setShowProjectSelect(false);
                        }}
                        className="block w-full px-2 py-1.5 text-left text-[10px] text-slate-400 hover:bg-white/5"
                      >
                        No project
                      </button>
                      {projects.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => {
                            setSelectedProjectId(p.id);
                            setShowProjectSelect(false);
                          }}
                          className="block w-full px-2 py-1.5 text-left text-[10px] text-white hover:bg-white/5"
                        >
                          {p.name}
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              {tasks.length > 0 && (
                <select
                  value={selectedTaskId ?? ''}
                  onChange={(e) => setSelectedTaskId(e.target.value ? Number(e.target.value) : null)}
                  className="max-w-[88px] rounded-md border border-white/10 bg-white/[0.03] px-1.5 py-1 text-[10px] text-slate-300"
                >
                  <option value="">Task</option>
                  {tasks.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              )}
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Working on…"
                className="min-w-0 flex-[2] rounded-md border border-white/10 bg-white/[0.03] px-2 py-1 text-[10px] text-white placeholder:text-slate-600"
              />
            </div>
          )}
        </header>
      </div>

      {/* ── Dashboard (offline overlay covers this, not the timer) ── */}
      <div className="relative z-10 flex min-h-0 flex-1 flex-col">
        <TrackerOfflineOverlay visible={!isOnline} />

        <div className="mx-3 mt-2 rounded-xl border border-white/[0.05] bg-white/[0.02] px-2 py-2">
          <TrackerWeekStrip
            compact
            weekOffset={weekOffset}
            onWeekOffsetChange={setWeekOffset}
            selectedDate={selectedDate}
            onSelectDate={handleSelectDate}
            refreshToken={refreshToken}
            activeEntry={activeEntry}
            isRunning={isRunning}
            elapsed={elapsed}
          />
        </div>

        <div className="relative mx-3 mt-2 flex items-end justify-center border-b border-white/[0.06] px-1 pb-0 pt-1">
          {tab === 'timesheet' ? (
            <button
              type="button"
              onClick={() => setShowAddEntry(true)}
              className="absolute left-0 bottom-1.5 inline-flex items-center gap-1 rounded-lg bg-sky-500/15 px-2.5 py-1.5 text-xs font-semibold text-sky-200 transition-colors hover:bg-sky-500/25"
            >
              <Plus className="h-3.5 w-3.5" />
              Add
            </button>
          ) : (
            <div className="absolute left-0 bottom-1.5 flex items-center gap-1 text-[10px] leading-none">
              <span className="font-semibold text-slate-300">{selectedDateShort}</span>
              <span className="text-slate-600">·</span>
              <span className="tabular-nums text-slate-400">{nowLabel}</span>
            </div>
          )}
          <div className="flex items-center gap-1">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={cn(
                  'border-b-2 px-4 py-2 text-xs font-semibold transition-colors',
                  tab === t.id
                    ? 'border-sky-400 text-white'
                    : 'border-transparent text-slate-500 hover:text-slate-300',
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => void handleRefresh()}
            disabled={refreshing}
            className="absolute right-0 bottom-1.5 rounded-lg p-1.5 text-slate-400 hover:bg-white/5 hover:text-sky-300 disabled:opacity-50"
            title="Refresh"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')} />
          </button>
        </div>

      {/* ── Scrollable content below tabs ── */}
      <main className="relative flex-1 overflow-y-auto overflow-x-hidden px-3 py-3">
        <AnimatePresence mode="wait">
          <motion.div
            key={`${tab}-${selectedDate}-${refreshToken}`}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.18 }}
          >
            {tab === 'summary' && (
              <TrackerDailySummaryTab
                selectedDate={selectedDate}
                refreshToken={refreshToken}
                liveLoggedSeconds={selectedDayLogged > 0 ? selectedDayLogged : undefined}
                liveSessionApps={isTodaySelected && isRunning ? liveSessionApps : undefined}
              />
            )}
            {tab === 'timesheet' && (
              <TrackerTimesheetTab selectedDate={selectedDate} refreshToken={refreshToken} />
            )}
            {tab === 'screenshots' && showScreenshots && (
              <TrackerScreenshotsTab selectedDate={selectedDate} refreshToken={refreshToken} />
            )}
          </motion.div>
        </AnimatePresence>
      </main>
      </div>

      <TrackerAddEntryModal
        open={showAddEntry}
        onClose={() => setShowAddEntry(false)}
        selectedDate={selectedDate}
        onSaved={() => {
          setRefreshToken((n) => n + 1);
          void loadActive();
        }}
      />
      {showSettings && (
        <TrackerSettingsModal open={showSettings} onClose={() => setShowSettings(false)} />
      )}
    </div>
  );
}

export default DesktopTrackerPage;
