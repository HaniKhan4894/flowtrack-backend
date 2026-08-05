import { useState, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Clock, Timer, BarChart3, AppWindow, TrendingDown, TrendingUp } from 'lucide-react';
import { AppIcon } from '../../components/AppIcon';
import { getAppDisplayName } from '../../utils/appIcons';
import { cn } from '../../lib/cn';
import type { HourBucket, HourlyTimelineData } from '../../types';

type RowType = 'time' | 'productivity' | 'apps';

interface HoverState {
  hour: number;
  row: RowType;
  x: number;
  y: number;
}

const formatClock = (seconds: number) => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}:${String(m).padStart(2, '0')}`;
};

const formatHm = (seconds: number) => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  return `00:${String(m).padStart(2, '0')}`;
};

const APP_COLORS = [
  '#6366f1', '#22c55e', '#f59e0b', '#ec4899', '#06b6d4',
  '#8b5cf6', '#f97316', '#14b8a6',
];

interface TopApp {
  app_name: string;
  duration_seconds?: number;
  percentage?: number;
  category?: string;
}

type AppCategoryGroup = 'productive' | 'unproductive' | 'neutral';

function normalizeAppCategory(category?: string): AppCategoryGroup {
  if (category === 'productive') return 'productive';
  if (category === 'unproductive') return 'unproductive';
  return 'neutral';
}

function aggregateAppsByCategory(
  data: HourlyTimelineData | null,
  topApps: TopApp[],
): Record<AppCategoryGroup, TopApp[]> {
  const map = new Map<string, TopApp>();

  const ingest = (appName: string, seconds: number, category?: string) => {
    if (!appName || seconds <= 0) return;
    const key = `${appName}::${normalizeAppCategory(category)}`;
    const existing = map.get(key);
    if (existing) {
      existing.duration_seconds = (existing.duration_seconds ?? 0) + seconds;
      return;
    }
    map.set(key, {
      app_name: appName,
      duration_seconds: seconds,
      category: normalizeAppCategory(category),
    });
  };

  data?.hours.forEach((hour) => {
    hour.apps.forEach((app) => ingest(app.app_name, app.seconds, app.category));
  });

  topApps.forEach((app) => {
    ingest(app.app_name, app.duration_seconds ?? 0, app.category);
  });

  const grouped: Record<AppCategoryGroup, TopApp[]> = {
    productive: [],
    unproductive: [],
    neutral: [],
  };

  for (const app of map.values()) {
    const group = normalizeAppCategory(app.category);
    grouped[group].push(app);
  }

  for (const group of Object.keys(grouped) as AppCategoryGroup[]) {
    const total = grouped[group].reduce((sum, app) => sum + (app.duration_seconds ?? 0), 0) || 1;
    grouped[group] = grouped[group]
      .sort((a, b) => (b.duration_seconds ?? 0) - (a.duration_seconds ?? 0))
      .slice(0, 4)
      .map((app) => ({
        ...app,
        percentage: Math.round(((app.duration_seconds ?? 0) / total) * 100),
      }));
  }

  return grouped;
}

function CategoryAppsColumn({
  title,
  toneClass,
  dotClass,
  apps,
}: {
  title: string;
  toneClass: string;
  dotClass: string;
  apps: TopApp[];
}) {
  return (
    <div className="min-w-0 flex-1">
      <div className="mb-1.5 flex items-center gap-1.5">
        <span className={cn('h-1.5 w-1.5 rounded-full', dotClass)} />
        <p className={cn('text-[9px] font-semibold uppercase tracking-wide', toneClass)}>{title}</p>
      </div>
      {apps.length > 0 ? (
        <div className="space-y-1.5">
          {apps.map((app) => (
            <div key={`${title}-${app.app_name}`} className="flex items-center gap-1.5 rounded-lg bg-white/[0.03] px-1.5 py-1">
              <AppIcon appName={app.app_name} size={28} className="!rounded-lg !p-0.5" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[9px] text-slate-300">{getAppDisplayName(app.app_name)}</p>
                <p className="text-[9px] tabular-nums text-slate-500">{formatHm(app.duration_seconds ?? 0)}</p>
              </div>
              <span className="text-[9px] font-bold tabular-nums text-slate-400">{app.percentage ?? 0}%</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="py-3 text-center text-[9px] text-slate-600">—</p>
      )}
    </div>
  );
}

interface HourlyTimelineProps {
  data: HourlyTimelineData | null;
  isLoading: boolean;
  selectedDate?: string;
  topApps?: TopApp[];
  variant?: 'default' | 'tracker';
  /** Timer / time-entry total for the day (distinct from activity-tracked seconds). */
  loggedSeconds?: number;
  /** Change in activity % vs yesterday (positive = up). */
  activityTrendDelta?: number | null;
}

const TooltipCard = ({ children }: { children: React.ReactNode }) => (
  <div className="relative bg-[#252836] border border-white/20 rounded-lg shadow-[0_8px_32px_rgba(0,0,0,0.6)] p-3 text-xs min-w-[160px]">
    {children}
    <div className="absolute left-1/2 -translate-x-1/2 -bottom-[5px] w-2.5 h-2.5 bg-[#252836] border-r border-b border-white/20 rotate-45" />
  </div>
);

const FloatingTooltip = ({ hover, hour }: { hover: HoverState; hour: HourBucket }) => {
  const style: React.CSSProperties = {
    position: 'fixed',
    left: hover.x,
    top: hover.y - 10,
    transform: 'translate(-50%, -100%)',
    zIndex: 99999,
    pointerEvents: 'none',
  };

  let content: React.ReactNode;

  if (hover.row === 'time') {
    content = (
      <TooltipCard>
        <div className="flex items-center justify-between gap-4 mb-0">
          <div className="flex items-center gap-1.5 text-white font-bold">
            <Timer size={13} className="text-sky-400" />
            {formatHm(hour.total_seconds)}
          </div>
          <span className="text-slate-400 font-mono text-[11px]">{hour.label}</span>
        </div>
      </TooltipCard>
    );
  } else if (hover.row === 'productivity') {
    content = (
      <TooltipCard>
        <div className="flex items-center justify-between gap-4 mb-2 pb-2 border-b border-white/10">
          <div className="flex items-center gap-1.5 text-white font-bold">
            <Timer size={13} className="text-sky-400" />
            {formatHm(hour.total_seconds)}
          </div>
          <span className="text-slate-400 font-mono text-[11px]">{hour.label}</span>
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" />
            <span className="text-slate-400 flex-1">Productive</span>
            <span className="text-white font-semibold">{formatHm(hour.productive_seconds)} h</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-sm bg-amber-400" />
            <span className="text-slate-400 flex-1">Unproductive</span>
            <span className="text-white font-semibold">{formatHm(hour.unproductive_seconds)} h</span>
          </div>
          {hour.neutral_seconds > 0 && (
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-sm bg-slate-500" />
              <span className="text-slate-400 flex-1">Neutral</span>
              <span className="text-white font-semibold">{formatHm(hour.neutral_seconds)} h</span>
            </div>
          )}
        </div>
      </TooltipCard>
    );
  } else {
    content = (
      <TooltipCard>
        <div className="flex items-center justify-between gap-4 mb-2 pb-2 border-b border-white/10">
          <span className="text-white font-bold text-[11px]">Apps</span>
          <span className="text-slate-400 font-mono text-[11px]">{hour.label}</span>
        </div>
        {hour.apps.length > 0 ? (
          <div className="space-y-2">
            {hour.apps.slice(0, 6).map((app) => (
              <div key={app.app_name} className="flex items-center gap-2">
                <AppIcon appName={app.app_name} size={18} />
                <span className="text-slate-200 flex-1 truncate">{getAppDisplayName(app.app_name)}</span>
                <span className="text-slate-400 font-mono">{formatHm(app.seconds)}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-slate-500">No apps this hour</p>
        )}
      </TooltipCard>
    );
  }

  return createPortal(
    <div style={style} className="relative">
      {content}
    </div>,
    document.body,
  );
};

const HourAxis = ({ hours }: { hours: HourBucket[] }) => (
  <div className="flex mb-1">
    {hours.map((h) => (
      <div key={h.hour} className="flex-1 text-center text-[10px] text-slate-500 font-mono">
        {h.hour % 3 === 0 ? h.label : ''}
      </div>
    ))}
  </div>
);

export const HourlyTimeline = ({ data, isLoading, selectedDate, topApps = [], variant = 'default', loggedSeconds, activityTrendDelta = null }: HourlyTimelineProps) => {
  const [hover, setHover] = useState<HoverState | null>(null);
  const [hoveredApp, setHoveredApp] = useState<string | null>(null);

  const setHoverFromEvent = useCallback((hour: number, row: RowType, e: React.MouseEvent<HTMLElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setHover({ hour, row, x: rect.left + rect.width / 2, y: rect.top });
  }, []);

  const clearHover = useCallback(() => setHover(null), []);

  const formattedDate = useMemo(() => {
    if (!selectedDate) return '';
    const d = new Date(`${selectedDate}T12:00:00`);
    return d.toLocaleDateString(undefined, { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' });
  }, [selectedDate]);

  const dayTopApps = useMemo(() => {
    if (topApps.length > 0) return topApps.slice(0, 5);
    if (!data) return [];
    const map = new Map<string, number>();
    data.hours.forEach((h) => {
      h.apps.forEach((a) => map.set(a.app_name, (map.get(a.app_name) ?? 0) + a.seconds));
    });
    const total = [...map.values()].reduce((s, v) => s + v, 0) || 1;
    return [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([app_name, duration_seconds]) => ({
        app_name,
        duration_seconds,
        percentage: Math.round((duration_seconds / total) * 100),
      }));
  }, [data, topApps]);

  const appsByCategory = useMemo(
    () => (variant === 'tracker' ? null : aggregateAppsByCategory(data, topApps)),
    [data, topApps, variant],
  );

  const hoveredHour = hover !== null ? data?.hours.find((h) => h.hour === hover.hour) : null;

  if (isLoading) {
    return (
      <div className="overlay-panel flex items-center justify-center py-24">
        <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!data || data.hours.every((h) => h.total_seconds === 0)) {
    return (
      <div className="overlay-panel flex flex-col items-center justify-center py-24 text-center">
        <Clock className="w-14 h-14 text-slate-700 mb-4" />
        <h3 className="text-lg font-bold text-white mb-2">No hourly activity</h3>
        <p className="text-slate-400 text-sm max-w-sm">Timeline will appear once activity is tracked for this date.</p>
      </div>
    );
  }

  const maxSeconds = Math.max(...data.hours.map((h) => h.total_seconds), 1);
  const timeLoggedSeconds = loggedSeconds ?? data.summary.total_seconds;
  // Activity is always part of tracked time, so it can never read higher than the hours logged.
  const activitySeconds = Math.min(
    data.summary.productive_seconds + data.summary.unproductive_seconds,
    timeLoggedSeconds > 0 ? timeLoggedSeconds : Number.MAX_SAFE_INTEGER,
  );
  const activityPct = timeLoggedSeconds > 0
    ? Math.min(100, Math.round((activitySeconds / timeLoggedSeconds) * 100))
    : 0;
  const rawActivitySeconds = data.summary.productive_seconds + data.summary.unproductive_seconds;
  const activityScale = rawActivitySeconds > 0 ? activitySeconds / rawActivitySeconds : 1;
  const productiveSeconds = Math.round(data.summary.productive_seconds * activityScale);
  const unproductiveSeconds = Math.max(0, activitySeconds - productiveSeconds);

  const peakHour = data.hours.reduce(
    (best, h) => (h.total_seconds > best.total_seconds ? h : best),
    data.hours[0],
  );
  const activeHourCount = data.hours.filter((h) => h.total_seconds > 0).length;
  const uniqueAppCount = new Set(
    data.hours.flatMap((h) => h.apps.map((a) => a.app_name)),
  ).size;
  const productiveShare = activitySeconds > 0
    ? Math.round((productiveSeconds / activitySeconds) * 100)
    : 0;
  const allTrackedSeconds = data.summary.productive_seconds
    + data.summary.unproductive_seconds
    + (data.summary.neutral_seconds ?? 0);
  const trackedBarTotal = allTrackedSeconds || 1;
  const activityBarTotal = activitySeconds || 1;
  const trackerTopApps = dayTopApps.slice(0, 5);

  const isActive = (hour: number, row: RowType) => hover?.hour === hour && hover?.row === row;
  const isTracker = variant === 'tracker';

  return (
    <>
      {hover && hoveredHour && (
        (hover.row === 'apps' ? hoveredHour.apps.length > 0 : hoveredHour.total_seconds > 0) && (
          <FloatingTooltip hover={hover} hour={hoveredHour} />
        )
      )}

      <div className={cn('overlay-panel rounded-2xl', isTracker && 'rounded-xl border-0 bg-transparent shadow-none')}>
        {!isTracker && (
        <div className="px-6 py-4 border-b border-white/8 flex items-center justify-between bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-white">{formattedDate}</span>
            {formattedDate && <span className="text-slate-600">|</span>}
            <span className="text-sm font-bold text-sky-400">{formatClock(timeLoggedSeconds)}</span>
          </div>
          <span className="text-xs font-bold px-3 py-1.5 rounded-lg bg-primary-500/15 text-primary-400 border border-primary-500/25">
            Timesheet
          </span>
        </div>
        )}

        {isTracker ? (
          <div className="overflow-hidden rounded-2xl border border-white/[0.07] bg-[#0b0f17]/90">
            {/* ── Where time went ── */}
            <div className="border-b border-white/[0.06] px-2.5 py-2.5">
              <p className="mb-2 text-[10px] font-medium text-slate-500">Where time went</p>
              {trackerTopApps.length > 0 ? (
                <div className="flex w-full items-end justify-between gap-1">
                  {trackerTopApps.map((app) => {
                    const isHot = hoveredApp === app.app_name;
                    const label = getAppDisplayName(app.app_name);
                    return (
                      <button
                        key={app.app_name}
                        type="button"
                        onMouseEnter={() => setHoveredApp(app.app_name)}
                        onMouseLeave={() => setHoveredApp(null)}
                        className={cn(
                          'flex min-w-0 flex-1 flex-col items-center justify-center gap-1.5 rounded-xl py-2 transition-colors',
                          isHot ? 'bg-white/[0.05]' : 'hover:bg-white/[0.03]',
                        )}
                        title={`${label} · ${app.percentage ?? 0}%`}
                      >
                        <AppIcon appName={app.app_name} size={44} />
                        <span className="max-w-[58px] truncate text-[9px] text-slate-500">{label.split(' ')[0]}</span>
                        <span className="text-[11px] font-bold tabular-nums text-slate-300">{app.percentage ?? 0}%</span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="flex h-16 items-center justify-center">
                  <p className="text-[10px] text-slate-600">No app data yet</p>
                </div>
              )}
            </div>

            {/* ── Hours tracked + Active work | Day insights ── */}
            <div className="grid grid-cols-2 divide-x divide-white/[0.06] border-b border-white/[0.06]">
              {/* Left: Hours tracked + Active work */}
              <div className="px-3 py-2.5">
                <div className="mb-2 flex items-start justify-between gap-1">
                  <div>
                    <p className="text-[10px] font-medium text-slate-500">Hours tracked</p>
                    <p className="text-2xl font-bold tabular-nums text-white">{formatClock(timeLoggedSeconds)}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <p className="text-[10px] font-medium text-slate-500">Active work</p>
                    <p className="text-lg font-bold tabular-nums text-sky-300">{formatClock(activitySeconds)}</p>
                    <span className="rounded-md bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-sky-300">
                      {activityPct}% active
                    </span>
                  </div>
                </div>
                <div className="h-1 overflow-hidden rounded-full bg-white/[0.06]">
                  <div className="flex h-full">
                    <div className="h-full bg-sky-500" style={{ width: `${(productiveSeconds / activityBarTotal) * 100}%` }} />
                    <div className="h-full bg-amber-400/70" style={{ width: `${(unproductiveSeconds / activityBarTotal) * 100}%` }} />
                  </div>
                </div>
                <div className="mt-1 flex justify-between text-[9px] text-slate-500">
                  <span>{formatHm(productiveSeconds)} productive</span>
                  <span>{formatHm(unproductiveSeconds)} off-track</span>
                </div>
                {activityTrendDelta != null && activityTrendDelta !== 0 && (
                  <span className={cn(
                    'mt-1.5 inline-flex items-center gap-0.5 text-[9px] font-medium',
                    activityTrendDelta > 0 ? 'text-emerald-400' : 'text-rose-400',
                  )}>
                    {activityTrendDelta > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                    {Math.abs(activityTrendDelta)}% vs yesterday
                  </span>
                )}
              </div>

              {/* Right: Day insights */}
              <div className="px-2.5 py-2.5">
                <p className="mb-2 text-[10px] font-medium text-slate-500">Day insights</p>
                <div className="grid grid-cols-2 gap-x-2 gap-y-2">
                  <div className="rounded-lg bg-white/[0.03] px-2 py-1.5">
                    <p className="text-[9px] text-slate-500">Peak hour</p>
                    <p className="text-[11px] font-semibold tabular-nums text-white">
                      {peakHour.total_seconds > 0 ? peakHour.label : '—'}
                    </p>
                  </div>
                  <div className="rounded-lg bg-white/[0.03] px-2 py-1.5">
                    <p className="text-[9px] text-slate-500">Active hours</p>
                    <p className="text-[11px] font-semibold tabular-nums text-sky-300">{activeHourCount}</p>
                  </div>
                  <div className="rounded-lg bg-white/[0.03] px-2 py-1.5">
                    <p className="text-[9px] text-slate-500">Apps used</p>
                    <p className="text-[11px] font-semibold tabular-nums text-white">{uniqueAppCount}</p>
                  </div>
                  <div className="rounded-lg bg-white/[0.03] px-2 py-1.5">
                    <p className="text-[9px] text-slate-500">Productive</p>
                    <p className="text-[11px] font-semibold tabular-nums text-emerald-400">{productiveShare}%</p>
                  </div>
                </div>
                {data.summary.focus_score > 0 && (
                  <p className="mt-2 text-center text-[9px] text-slate-500">
                    Focus score <span className="font-semibold text-violet-300">{Math.round(data.summary.focus_score)}</span>
                  </p>
                )}
              </div>
            </div>

            {/* ── Unified timeline ── */}
            <div className="px-3 py-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-medium text-slate-300">Hourly breakdown</span>
                <div className="flex items-center gap-3 text-[9px] text-slate-500">
                  <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-sky-500" /> Hours</span>
                  <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-cyan-400" /> Focus</span>
                  <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-amber-400" /> Off-track</span>
                </div>
              </div>

              <div className="flex gap-2">
                <div className="flex w-9 shrink-0 flex-col justify-end gap-[14px] pb-[1px] text-[9px] font-medium text-slate-500">
                  <span className="leading-none">Hours</span>
                  <span className="leading-none">Focus</span>
                  <span className="leading-none">Apps</span>
                </div>

                <div className="min-w-0 flex-1">
                  <HourAxis hours={data.hours} />

                  {/* Hours row */}
                  <div className="mb-2 flex h-12 items-end gap-px">
                    {data.hours.map((h) => {
                      const heightPct = h.total_seconds > 0 ? Math.max(10, (h.total_seconds / maxSeconds) * 100) : 0;
                      const active = isActive(h.hour, 'time');
                      return (
                        <div
                          key={`t-${h.hour}`}
                          className="flex h-full flex-1 items-end cursor-pointer"
                          onMouseEnter={(e) => h.total_seconds > 0 && setHoverFromEvent(h.hour, 'time', e)}
                          onMouseLeave={clearHover}
                        >
                          <div
                            className={cn(
                              'w-full rounded-sm transition-all',
                              h.total_seconds > 0
                                ? active ? 'bg-sky-300' : 'bg-sky-500/70 hover:bg-sky-400/90'
                                : 'bg-transparent',
                            )}
                            style={{ height: h.total_seconds > 0 ? `${heightPct}%` : 0 }}
                          />
                        </div>
                      );
                    })}
                  </div>

                  {/* Focus row */}
                  <div className="mb-2 flex h-5 gap-px">
                    {data.hours.map((h) => {
                      const total = h.total_seconds || 1;
                      const prodPct = (h.productive_seconds / total) * 100;
                      const unprodPct = (h.unproductive_seconds / total) * 100;
                      const neutralPct = 100 - prodPct - unprodPct;
                      const active = isActive(h.hour, 'productivity');
                      return (
                        <div
                          key={`p-${h.hour}`}
                          className={cn(
                            'h-full flex-1 cursor-pointer overflow-hidden rounded-sm',
                            active && 'ring-1 ring-sky-400/70',
                          )}
                          onMouseEnter={(e) => h.total_seconds > 0 && setHoverFromEvent(h.hour, 'productivity', e)}
                          onMouseLeave={clearHover}
                        >
                          {h.total_seconds > 0 ? (
                            <div className="flex h-full flex-col">
                              {prodPct > 0 && <div className="min-h-[1px] bg-cyan-500" style={{ flex: prodPct }} />}
                              {unprodPct > 0 && <div className="min-h-[1px] bg-amber-400/80" style={{ flex: unprodPct }} />}
                              {neutralPct > 0 && <div className="min-h-[1px] bg-slate-600/60" style={{ flex: neutralPct }} />}
                            </div>
                          ) : (
                            <div className="h-full bg-white/[0.03]" />
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Apps row */}
                  <div className="flex h-6 gap-px">
                    {data.hours.map((h) => {
                      const active = isActive(h.hour, 'apps');
                      return (
                        <div
                          key={`a-${h.hour}`}
                          className={cn(
                            'h-full flex-1 cursor-pointer overflow-hidden rounded-sm',
                            active && 'ring-1 ring-violet-400/60',
                          )}
                          onMouseEnter={(e) => h.apps.length > 0 && setHoverFromEvent(h.hour, 'apps', e)}
                          onMouseLeave={clearHover}
                        >
                          {h.apps.length > 0 ? (
                            <div className="flex h-full flex-col">
                              {h.apps.slice(0, 6).map((app, idx) => (
                                <div
                                  key={app.app_name}
                                  style={{ flex: app.seconds, backgroundColor: APP_COLORS[idx % APP_COLORS.length] }}
                                  className="min-h-[1px]"
                                />
                              ))}
                            </div>
                          ) : (
                            <div className="h-full bg-white/[0.03]" />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
        <>
        {appsByCategory && (
          <div className="border-b border-white/8 px-5 py-4">
            <p className="mb-2 text-[10px] font-medium text-slate-500">Apps by focus</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <CategoryAppsColumn
                title="Productive"
                toneClass="text-cyan-300"
                dotClass="bg-cyan-400"
                apps={appsByCategory.productive}
              />
              <CategoryAppsColumn
                title="Off-track"
                toneClass="text-amber-300"
                dotClass="bg-amber-400"
                apps={appsByCategory.unproductive}
              />
              <CategoryAppsColumn
                title="Neutral"
                toneClass="text-slate-400"
                dotClass="bg-slate-500"
                apps={appsByCategory.neutral}
              />
            </div>
          </div>
        )}
        <div className="flex flex-col lg:flex-row">
          <div className="lg:w-52 flex-shrink-0 border-b lg:border-b-0 lg:border-r border-white/8 p-5 space-y-5 bg-white/[0.01]">
            <div>
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">Time logged (h)</p>
              <p className="text-3xl font-bold text-white">{formatClock(timeLoggedSeconds)}</p>
            </div>
            <div>
              <div className="flex items-baseline justify-between mb-1">
                <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Activity time (h)</p>
                <span className="text-xs font-bold text-emerald-400">{activityPct}%</span>
              </div>
              <p className="text-xl font-bold text-white mb-2">{formatClock(activitySeconds)}</p>
              <div className="h-2.5 rounded-full overflow-hidden flex bg-white/5">
                <div className="h-full bg-emerald-500" style={{ width: `${(data.summary.productive_seconds / trackedBarTotal) * 100}%` }} />
                <div className="h-full bg-amber-400" style={{ width: `${(data.summary.unproductive_seconds / trackedBarTotal) * 100}%` }} />
              </div>
              <div className="flex justify-between text-[10px] text-slate-500 mt-1 font-mono">
                <span className="text-emerald-400/80">{formatHm(data.summary.productive_seconds)}</span>
                <span className="text-amber-400/80">{formatHm(data.summary.unproductive_seconds)}</span>
              </div>
            </div>
            {dayTopApps.length > 0 && (
              <div>
                <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Top active apps</p>
                <div className="flex flex-wrap gap-2">
                  {dayTopApps.map((app) => (
                    <div key={app.app_name} className="flex flex-col items-center gap-1 min-w-[40px]">
                      <AppIcon appName={app.app_name} size={32} />
                      <span className="text-[9px] font-bold text-slate-500">{app.percentage ?? 0}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0 w-full p-5 overflow-x-auto">
            <div className="space-y-5 min-w-[860px]">
              <HourAxis hours={data.hours} />

              <div>
                <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Clock size={12} className="text-slate-400" />
                  Time logged by hour
                </p>
                <div className="flex gap-[2px] items-end rounded-lg bg-[#0d0f14]/80 border border-white/5 px-2 py-2 h-[72px] gap-[4px]">
                  {data.hours.map((h) => {
                    const heightPct = h.total_seconds > 0 ? Math.max(15, (h.total_seconds / maxSeconds) * 100) : 0;
                    const active = isActive(h.hour, 'time');
                    return (
                      <div
                        key={`t-${h.hour}`}
                        className="flex-1 h-full flex items-end justify-center cursor-pointer"
                        onMouseEnter={(e) => h.total_seconds > 0 && setHoverFromEvent(h.hour, 'time', e)}
                        onMouseLeave={clearHover}
                      >
                        <div
                          className={`w-full rounded-t transition-all duration-150 max-w-[24px] ${
                            h.total_seconds > 0
                              ? active ? 'bg-slate-200 shadow-md' : 'bg-slate-500/80 hover:bg-slate-400'
                              : ''
                          }`}
                          style={{ height: h.total_seconds > 0 ? `${heightPct}%` : 0 }}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>

              <div>
                <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <BarChart3 size={12} className="text-emerald-500" />
                  Productivity by hour
                </p>
                <div className="flex gap-[2px] rounded-lg bg-[#0d0f14]/80 border border-white/5 px-2 py-1.5 h-10 gap-[4px]">
                  {data.hours.map((h) => {
                    const total = h.total_seconds || 1;
                    const prodPct = (h.productive_seconds / total) * 100;
                    const unprodPct = (h.unproductive_seconds / total) * 100;
                    const neutralPct = 100 - prodPct - unprodPct;
                    const active = isActive(h.hour, 'productivity');
                    return (
                      <div
                        key={`p-${h.hour}`}
                        className={`flex-1 h-full rounded-sm cursor-pointer overflow-hidden transition-all ${
                          active ? 'ring-2 ring-sky-400/60' : ''
                        }`}
                        onMouseEnter={(e) => h.total_seconds > 0 && setHoverFromEvent(h.hour, 'productivity', e)}
                        onMouseLeave={clearHover}
                      >
                        {h.total_seconds > 0 ? (
                          <div className="h-full flex flex-col">
                            {prodPct > 0 && <div className="bg-emerald-500 min-h-[1px]" style={{ flex: prodPct }} />}
                            {unprodPct > 0 && <div className="bg-amber-400 min-h-[1px]" style={{ flex: unprodPct }} />}
                            {neutralPct > 0 && <div className="bg-slate-600 min-h-[1px]" style={{ flex: neutralPct }} />}
                          </div>
                        ) : (
                          <div className="h-full bg-white/[0.04]" />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div>
                <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <AppWindow size={12} className="text-violet-400" />
                  Active apps
                </p>
                <div className="flex gap-[2px] rounded-lg bg-[#0d0f14]/80 border border-white/5 px-2 py-1.5 h-11 gap-[4px]">
                  {data.hours.map((h) => {
                    const active = isActive(h.hour, 'apps');
                    return (
                      <div
                        key={`a-${h.hour}`}
                        className={`flex-1 h-full rounded-sm cursor-pointer overflow-hidden transition-all ${
                          active ? 'ring-2 ring-sky-400/60' : ''
                        }`}
                        onMouseEnter={(e) => h.apps.length > 0 && setHoverFromEvent(h.hour, 'apps', e)}
                        onMouseLeave={clearHover}
                      >
                        {h.apps.length > 0 ? (
                          <div className="h-full flex flex-col">
                            {h.apps.slice(0, 6).map((app, idx) => (
                              <div
                                key={app.app_name}
                                style={{ flex: app.seconds, backgroundColor: APP_COLORS[idx % APP_COLORS.length] }}
                                className="min-h-[1px]"
                              />
                            ))}
                          </div>
                        ) : (
                          <div className="h-full bg-white/[0.04]" />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center gap-4 text-[10px] text-slate-500 pt-1">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-slate-500" /> Time</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-emerald-500" /> Productive</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-amber-400" /> Unproductive</span>
              </div>
            </div>
          </div>
        </div>
        </>
        )}
      </div>
    </>
  );
};
