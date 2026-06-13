import { useState, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Clock, Timer, BarChart3, AppWindow } from 'lucide-react';
import { AppIcon } from '../../components/AppIcon';
import { getAppDisplayName } from '../../utils/appIcons';
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
}

interface HourlyTimelineProps {
  data: HourlyTimelineData | null;
  isLoading: boolean;
  selectedDate?: string;
  topApps?: TopApp[];
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

export const HourlyTimeline = ({ data, isLoading, selectedDate, topApps = [] }: HourlyTimelineProps) => {
  const [hover, setHover] = useState<HoverState | null>(null);

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
  const activityPct = data.summary.total_seconds > 0
    ? Math.round((data.summary.productive_seconds / data.summary.total_seconds) * 100)
    : 0;
  const neutralSeconds = Math.max(0, data.summary.total_seconds - data.summary.productive_seconds - data.summary.unproductive_seconds);

  const isActive = (hour: number, row: RowType) => hover?.hour === hour && hover?.row === row;

  return (
    <>
      {hover && hoveredHour && (
        (hover.row === 'apps' ? hoveredHour.apps.length > 0 : hoveredHour.total_seconds > 0) && (
          <FloatingTooltip hover={hover} hour={hoveredHour} />
        )
      )}

      <div className="overlay-panel rounded-2xl">
        <div className="px-6 py-4 border-b border-white/8 flex items-center justify-between bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-white">{formattedDate}</span>
            {formattedDate && <span className="text-slate-600">|</span>}
            <span className="text-sm font-bold text-sky-400">{formatClock(data.summary.total_seconds)}</span>
          </div>
          <span className="text-xs font-bold px-3 py-1.5 rounded-lg bg-primary-500/15 text-primary-400 border border-primary-500/25">
            Timesheet
          </span>
        </div>

        <div className="flex flex-col lg:flex-row">
          <div className="lg:w-52 flex-shrink-0 border-b lg:border-b-0 lg:border-r border-white/8 p-5 space-y-5 bg-white/[0.01]">
            <div>
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">Time logged (h)</p>
              <p className="text-3xl font-bold text-white">{formatClock(data.summary.total_seconds)}</p>
            </div>
            <div>
              <div className="flex items-baseline justify-between mb-1">
                <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Activity time (h)</p>
                <span className="text-xs font-bold text-emerald-400">{activityPct}%</span>
              </div>
              <p className="text-xl font-bold text-white mb-2">{formatClock(data.summary.total_seconds)}</p>
              <div className="h-2.5 rounded-full overflow-hidden flex bg-white/5">
                <div className="h-full bg-emerald-500" style={{ width: `${(data.summary.productive_seconds / (data.summary.total_seconds || 1)) * 100}%` }} />
                <div className="h-full bg-amber-400" style={{ width: `${(data.summary.unproductive_seconds / (data.summary.total_seconds || 1)) * 100}%` }} />
                <div className="h-full bg-slate-600" style={{ width: `${(neutralSeconds / (data.summary.total_seconds || 1)) * 100}%` }} />
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

          <div className="flex-1 p-5 overflow-x-auto">
            <div className="min-w-[860px] space-y-5">
              <HourAxis hours={data.hours} />

              {/* Section 1: Time logged by hour */}
              <div>
                <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Clock size={12} className="text-slate-400" />
                  Time logged by hour
                </p>
                <div className="flex gap-[4px] h-[72px] items-end rounded-lg bg-[#0d0f14]/80 border border-white/5 px-2 py-2">
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
                          className={`w-full max-w-[24px] rounded-t transition-all duration-150 ${
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

              {/* Section 2: Productivity */}
              <div>
                <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <BarChart3 size={12} className="text-emerald-500" />
                  Productivity by hour
                </p>
                <div className="flex gap-[4px] h-10 rounded-lg bg-[#0d0f14]/80 border border-white/5 px-2 py-1.5">
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

              {/* Section 3: Active apps */}
              <div>
                <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <AppWindow size={12} className="text-violet-400" />
                  Active apps
                </p>
                <div className="flex gap-[4px] h-11 rounded-lg bg-[#0d0f14]/80 border border-white/5 px-2 py-1.5">
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
      </div>
    </>
  );
};
