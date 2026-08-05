import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { reportService } from '../../api/reportService';
import { activityService } from '../../api/activityService';
import { HourlyTimeline } from '../activity/HourlyTimeline';
import type { HourlyTimelineData } from '../../types';
import { computeActivityPct, shiftDateKey } from './trackerMetrics';
import { localDateKey } from '../../utils/liveTimer';

interface Props {
  selectedDate: string;
  refreshToken?: number;
  autoRefresh?: boolean;
  liveLoggedSeconds?: number;
  liveSessionApps?: { app_name: string; duration_seconds?: number; percentage?: number }[];
}

function guessLiveCategory(appName: string): 'productive' | 'unproductive' | 'neutral' | 'uncategorized' {
  const hay = appName.toLowerCase();
  if (/cursor|code|vscode|phpstorm|terminal|devenv|sublime|notion|figma|slack|teams|zoom/i.test(hay)) {
    return 'productive';
  }
  if (/tiktok|netflix|spotify|youtube|instagram|facebook|reddit/i.test(hay)) {
    return 'unproductive';
  }
  return 'neutral';
}

/** Merge unsynced live session apps into the current hour bucket. */
function mergeLiveIntoTimeline(
  timeline: HourlyTimelineData | null,
  liveSessionApps: { app_name: string; duration_seconds?: number }[] | undefined,
  selectedDate: string,
): HourlyTimelineData | null {
  if (!timeline || !liveSessionApps?.length) return timeline;
  if (selectedDate !== localDateKey()) return timeline;

  const currentHour = new Date().getHours();
  let dayProductive = timeline.summary.productive_seconds;
  let dayUnproductive = timeline.summary.unproductive_seconds;
  let dayNeutral = timeline.summary.neutral_seconds ?? 0;
  let dayTotal = timeline.summary.total_seconds;

  const hours = timeline.hours.map((h) => {
    if (h.hour !== currentHour) return h;

    const appsMap = new Map(h.apps.map((a) => [a.app_name, { ...a }]));
    let addedProductive = 0;
    let addedUnproductive = 0;
    let addedNeutral = 0;
    let addedTotal = 0;

    for (const app of liveSessionApps) {
      const secs = app.duration_seconds ?? 0;
      if (secs <= 0) continue;

      addedTotal += secs;
      const category = guessLiveCategory(app.app_name);
      if (category === 'productive') addedProductive += secs;
      else if (category === 'unproductive') addedUnproductive += secs;
      else addedNeutral += secs;

      const existing = appsMap.get(app.app_name);
      if (existing) {
        existing.seconds += secs;
      } else {
        appsMap.set(app.app_name, {
          app_name: app.app_name,
          seconds: secs,
          category,
        });
      }
    }

    if (addedTotal <= 0) return h;

    const apps = Array.from(appsMap.values())
      .sort((a, b) => b.seconds - a.seconds)
      .slice(0, 10);

    dayProductive += addedProductive;
    dayUnproductive += addedUnproductive;
    dayNeutral += addedNeutral;
    dayTotal += addedTotal;

    return {
      ...h,
      total_seconds: h.total_seconds + addedTotal,
      productive_seconds: h.productive_seconds + addedProductive,
      unproductive_seconds: h.unproductive_seconds + addedUnproductive,
      neutral_seconds: (h.neutral_seconds ?? 0) + addedNeutral,
      apps,
    };
  });

  if (dayTotal === timeline.summary.total_seconds) return timeline;

  return {
    ...timeline,
    hours,
    summary: {
      ...timeline.summary,
      total_seconds: dayTotal,
      productive_seconds: dayProductive,
      unproductive_seconds: dayUnproductive,
      neutral_seconds: dayNeutral,
      focus_score: dayTotal > 0 ? Math.round((dayProductive / dayTotal) * 100) : 0,
    },
  };
}

export function TrackerDailySummaryTab({
  selectedDate,
  refreshToken = 0,
  autoRefresh = false,
  liveLoggedSeconds = 0,
  liveSessionApps,
}: Props) {
  const [timelineData, setTimelineData] = useState<HourlyTimelineData | null>(null);
  const [topApps, setTopApps] = useState<{ app_name: string; duration_seconds?: number; percentage?: number }[]>([]);
  const [loggedSeconds, setLoggedSeconds] = useState<number | undefined>();
  const [yesterdayLogged, setYesterdayLogged] = useState(0);
  const [yesterdayTimeline, setYesterdayTimeline] = useState<HourlyTimelineData | null>(null);
  const [loading, setLoading] = useState(true);
  const hasLoadedRef = useRef(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const range = {
        start_date: `${selectedDate} 00:00:00`,
        end_date: `${selectedDate} 23:59:59`,
      };
      const picked = new Date(`${selectedDate}T12:00:00`);
      const yesterdayKey = shiftDateKey(selectedDate, -1);
      const yesterdayPicked = new Date(`${yesterdayKey}T12:00:00`);

      const [timelineResp, appsResp, calendarResp, yesterdayTimelineResp, yesterdayCalendarResp] = await Promise.all([
        reportService.getHourlyTimeline({ date: selectedDate }),
        activityService.getTopApps(range),
        reportService.getHoursCalendar({
          year: picked.getFullYear(),
          month: picked.getMonth() + 1,
        }),
        reportService.getHourlyTimeline({ date: yesterdayKey }),
        reportService.getHoursCalendar({
          year: yesterdayPicked.getFullYear(),
          month: yesterdayPicked.getMonth() + 1,
        }),
      ]);

      setTimelineData(timelineResp.data);
      setTopApps(appsResp.data?.apps ?? []);
      const dayRow = calendarResp.data.days.find((d) => d.date === selectedDate);
      setLoggedSeconds(dayRow?.seconds ?? 0);
      const yesterdayRow = yesterdayCalendarResp.data.days.find((d) => d.date === yesterdayKey);
      setYesterdayLogged(yesterdayRow?.seconds ?? 0);
      setYesterdayTimeline(yesterdayTimelineResp.data);
      hasLoadedRef.current = true;
    } catch {
      setTimelineData(null);
      setTopApps([]);
      setLoggedSeconds(undefined);
      setYesterdayLogged(0);
      setYesterdayTimeline(null);
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

  useEffect(() => {
    hasLoadedRef.current = false;
  }, [selectedDate]);

  useEffect(() => {
    void load(hasLoadedRef.current);
  }, [load, refreshToken]);

  // Silent background refresh while timer runs — no UI remount / spinner.
  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(() => {
      void load(true);
    }, 65_000);
    return () => clearInterval(id);
  }, [autoRefresh, load]);

  const effectiveLoggedSeconds = Math.max(loggedSeconds ?? 0, liveLoggedSeconds ?? 0);

  /**
   * Merge historical API topApps with current-session live data.
   * We never replace API data — we add session seconds on top so the
   * percentage is always relative to the FULL day (like Trackabi).
   */
  const effectiveTopApps = useMemo(() => {
    if (!liveSessionApps || liveSessionApps.length === 0) {
      return topApps;
    }

    const merged = new Map<string, number>();

    for (const app of topApps) {
      merged.set(app.app_name, (merged.get(app.app_name) ?? 0) + (app.duration_seconds ?? 0));
    }

    for (const app of liveSessionApps) {
      merged.set(app.app_name, (merged.get(app.app_name) ?? 0) + (app.duration_seconds ?? 0));
    }

    const total = Array.from(merged.values()).reduce((s, v) => s + v, 0) || 1;

    return Array.from(merged.entries())
      .map(([app_name, duration_seconds]) => ({
        app_name,
        duration_seconds,
        percentage: Math.round((duration_seconds / total) * 100),
      }))
      .sort((a, b) => b.duration_seconds - a.duration_seconds)
      .slice(0, 5);
  }, [liveSessionApps, topApps]);

  const activityTrendDelta = useMemo(() => {
    if (!timelineData || yesterdayLogged <= 0 || effectiveLoggedSeconds <= 0) return null;
    const todayPct = computeActivityPct(effectiveLoggedSeconds, timelineData);
    const yesterdayPct = computeActivityPct(yesterdayLogged, yesterdayTimeline);
    return todayPct - yesterdayPct;
  }, [timelineData, yesterdayTimeline, yesterdayLogged, effectiveLoggedSeconds]);

  const effectiveTimelineData = useMemo(
    () => mergeLiveIntoTimeline(timelineData, liveSessionApps, selectedDate),
    [timelineData, liveSessionApps, selectedDate],
  );

  return (
    <HourlyTimeline
      data={effectiveTimelineData}
      isLoading={loading}
      selectedDate={selectedDate}
      topApps={effectiveTopApps}
      variant="tracker"
      loggedSeconds={effectiveLoggedSeconds > 0 ? effectiveLoggedSeconds : undefined}
      activityTrendDelta={activityTrendDelta}
    />
  );
}
