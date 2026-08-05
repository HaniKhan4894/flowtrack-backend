import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { reportService } from '../../api/reportService';
import { activityService } from '../../api/activityService';
import { HourlyTimeline } from '../activity/HourlyTimeline';
import type { HourlyTimelineData } from '../../types';
import { computeActivityPct, shiftDateKey } from './trackerMetrics';

interface Props {
  selectedDate: string;
  refreshToken?: number;
  liveLoggedSeconds?: number;
  liveSessionApps?: { app_name: string; duration_seconds?: number; percentage?: number }[];
}

export function TrackerDailySummaryTab({
  selectedDate,
  refreshToken = 0,
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

  const effectiveLoggedSeconds = Math.max(loggedSeconds ?? 0, liveLoggedSeconds ?? 0);

  const effectiveTopApps = useMemo(() => {
    if (liveSessionApps && liveSessionApps.length > 0) {
      return liveSessionApps;
    }
    return topApps;
  }, [liveSessionApps, topApps]);

  const activityTrendDelta = useMemo(() => {
    if (!timelineData || yesterdayLogged <= 0 || effectiveLoggedSeconds <= 0) return null;
    const todayPct = computeActivityPct(effectiveLoggedSeconds, timelineData);
    const yesterdayPct = computeActivityPct(yesterdayLogged, yesterdayTimeline);
    return todayPct - yesterdayPct;
  }, [timelineData, yesterdayTimeline, yesterdayLogged, effectiveLoggedSeconds]);

  return (
    <HourlyTimeline
      data={timelineData}
      isLoading={loading}
      selectedDate={selectedDate}
      topApps={effectiveTopApps}
      variant="tracker"
      loggedSeconds={effectiveLoggedSeconds > 0 ? effectiveLoggedSeconds : undefined}
      activityTrendDelta={activityTrendDelta}
    />
  );
}
