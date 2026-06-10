import { motion } from 'framer-motion';
import { Activity, AppWindow, Search, RefreshCw, ChevronLeft, ChevronRight, Calendar, BarChart3, Keyboard, MousePointer } from 'lucide-react';
import { Button } from '../../components/ui';
import { activityService } from '../../api/activityService';
import { TeamMemberFilter } from '../../components/TeamMemberFilter';
import { AppIcon } from '../../components/AppIcon';
import { getAppDisplayName } from '../../utils/appIcons';
import { useAuthStore } from '../../store/authStore';
import { isOrgAdmin } from '../../utils/access';
import { useState, useEffect, useCallback, useMemo } from 'react';

const formatDuration = (seconds: number) => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
};

const ActivityPage = () => {
  const { user } = useAuthStore();
  const [logs, setLogs] = useState<any[]>([]);
  const [topApps, setTopApps] = useState<any[]>([]);
  const [summary, setSummary] = useState({ total_seconds: 0, total_events: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [viewingMemberName, setViewingMemberName] = useState('');

  const effectiveUserId = selectedUserId ?? user?.id ?? null;
  const isToday = selectedDate === new Date().toISOString().split('T')[0];

  const fetchData = useCallback(async () => {
    if (!effectiveUserId) return;
    try {
      setIsLoading(true);
      const range = {
        start_date: `${selectedDate} 00:00:00`,
        end_date: `${selectedDate} 23:59:59`,
        user_id: isOrgAdmin(user) && selectedUserId ? selectedUserId : undefined,
      };

      const [logsResp, topAppsResp] = await Promise.all([
        activityService.getAll(range),
        activityService.getTopApps(range),
      ]);

      setLogs(logsResp.data ?? []);
      setTopApps(topAppsResp.data?.apps ?? []);
      setSummary({
        total_seconds: topAppsResp.data?.total_seconds ?? 0,
        total_events: topAppsResp.data?.total_events ?? 0,
      });
    } catch (error) {
      console.error('Failed to fetch activity logs', error);
      setLogs([]);
      setTopApps([]);
      setSummary({ total_seconds: 0, total_events: 0 });
    } finally {
      setIsLoading(false);
    }
  }, [selectedDate, effectiveUserId, selectedUserId, user]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const changeDate = (days: number) => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + days);
    setSelectedDate(d.toISOString().split('T')[0]);
  };

  const filteredLogs = logs.filter(log =>
    !searchTerm ||
    (log.app_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (log.window_title || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (log.url || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const productivityReport = useMemo(() => {
    const categories: Record<string, number> = { productive: 0, unproductive: 0, uncategorized: 0 };
    let keystrokes = 0;
    let clicks = 0;
    let mouse = 0;

    filteredLogs.forEach((log) => {
      const dur = Number(log.duration_seconds) || 60;
      const cat = log.category || 'uncategorized';
      if (cat in categories) {
        categories[cat] += dur;
      } else {
        categories.uncategorized += dur;
      }
      keystrokes += Number(log.keyboard_strokes) || 0;
      clicks += Number(log.mouse_clicks) || 0;
      mouse += Number(log.mouse_movement) || 0;
    });

    const total = Object.values(categories).reduce((sum, v) => sum + v, 0);
    const focusScore = total > 0 ? Math.round((categories.productive / total) * 100) : 0;

    return { categories, total, keystrokes, clicks, mouse, focusScore };
  }, [filteredLogs]);

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2 flex items-center gap-2">
            <Activity className="text-primary-400" />
            Activity Logs
          </h1>
          <p className="text-slate-400">
            {viewingMemberName && isOrgAdmin(user)
              ? `Viewing activity for ${viewingMemberName}.`
              : 'Deep dive into application and website usage patterns.'}
          </p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          <TeamMemberFilter
            selectedUserId={selectedUserId}
            onChange={(id, member) => {
              setSelectedUserId(id);
              setViewingMemberName(member ? `${member.first_name} ${member.last_name}` : '');
            }}
          />

          <div className="flex items-center gap-2 bg-[#12141C] border border-white/10 rounded-xl px-2 py-1.5 h-10">
            <button onClick={() => changeDate(-1)} className="p-1 hover:bg-white/10 rounded-lg text-slate-400">
              <ChevronLeft size={16} />
            </button>
            <div className="flex items-center gap-1.5 px-1">
              <Calendar size={13} className="text-primary-400" />
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="bg-transparent border-0 text-xs font-bold text-white p-0 focus:ring-0 w-28 uppercase"
              />
            </div>
            <button onClick={() => changeDate(1)} className="p-1 hover:bg-white/10 rounded-lg text-slate-400">
              <ChevronRight size={16} />
            </button>
          </div>

          {isToday && (
            <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-1 rounded-full">
              Live
            </span>
          )}

          {!isToday && (
            <button
              onClick={() => setSelectedDate(new Date().toISOString().split('T')[0])}
              className="text-xs font-bold text-primary-400 hover:underline"
            >
              Today
            </button>
          )}

          <Button variant="secondary" size="sm" onClick={fetchData} isLoading={isLoading}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input 
              type="text" 
              placeholder="Search..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-[#12141C] border border-white/10 rounded-xl pl-10 pr-4 py-2 text-sm text-white focus:outline-none focus:border-primary-500/50 min-w-[180px]"
            />
          </div>
        </div>
      </div>

      {/* Trackabi-style top active apps strip */}
      {!isLoading && topApps.length > 0 && (
        <div className="overlay-panel p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider">Top Active Apps</h3>
            <span className="text-xs text-slate-500">{formatDuration(summary.total_seconds)} tracked</span>
          </div>
          <div className="flex flex-wrap gap-4">
            {topApps.slice(0, 5).map((app) => (
              <div key={app.app_name} className="flex flex-col items-center gap-2 min-w-[72px]">
                <AppIcon appName={app.app_name} size={48} />
                <div className="text-center">
                  <p className="text-[11px] font-semibold text-white truncate max-w-[80px]" title={app.app_name}>
                    {getAppDisplayName(app.app_name).length > 10
                      ? `${getAppDisplayName(app.app_name).slice(0, 10)}…`
                      : getAppDisplayName(app.app_name)}
                  </p>
                  <p className="text-sm font-bold text-primary-400">{app.percentage}%</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Summary bar */}
      {!isLoading && (logs.length > 0 || topApps.length > 0) && (
        <div className="flex items-center gap-6 overlay-panel py-3 px-6">
          <div className="text-center">
            <p className="text-2xl font-bold text-white">{summary.total_events || filteredLogs.length}</p>
            <p className="text-xs text-slate-500 uppercase tracking-wider">Events</p>
          </div>
          <div className="h-8 w-px bg-white/10" />
          <div className="text-center">
            <p className="text-2xl font-bold text-white">{formatDuration(summary.total_seconds)}</p>
            <p className="text-xs text-slate-500 uppercase tracking-wider">Total Time</p>
          </div>
          <div className="h-8 w-px bg-white/10" />
          <div className="text-center">
            <p className="text-2xl font-bold text-white">{topApps.length}</p>
            <p className="text-xs text-slate-500 uppercase tracking-wider">Apps Used</p>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <RefreshCw className="w-8 h-8 text-primary-500 animate-spin" />
        </div>
      ) : logs.length === 0 && topApps.length === 0 ? (
        <div className="overlay-panel flex flex-col items-center justify-center py-20 text-center">
          <Activity className="w-16 h-16 text-slate-700 mb-4" />
          <h3 className="text-xl font-bold text-white mb-2">No activity recorded</h3>
          <p className="text-slate-400 max-w-sm">
            Activity logs will appear here once the timer is started and you begin working.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Top Apps with % bars */}
          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="overlay-panel p-6"
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <AppWindow className="text-primary-400" size={20} />
                Top Applications
              </h3>
              {isToday && (
                <span className="text-xs font-bold text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-full uppercase tracking-widest">Live</span>
              )}
            </div>

            <div className="space-y-6">
              {topApps.map((app) => (
                <div key={app.app_name} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <AppIcon appName={app.app_name} size={40} />
                      <div>
                        <p className="font-semibold text-white">{getAppDisplayName(app.app_name)}</p>
                        <p className="text-xs text-slate-500 capitalize">{app.category || 'uncategorized'}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-white tracking-tight">{formatDuration(app.duration_seconds)}</p>
                      <p className="text-[10px] text-slate-500">{app.percentage}% of session</p>
                    </div>
                  </div>
                  <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${app.percentage}%` }}
                      className={`h-full ${
                        app.category === 'productive' ? 'bg-primary-500' : 
                        app.category === 'unproductive' ? 'bg-accent' : 
                        'bg-slate-500'
                      }`}
                    />
                  </div>
                </div>
              ))}
              {topApps.length === 0 && (
                <p className="text-center text-slate-500 py-6 text-sm">No app data for this date.</p>
              )}
            </div>
          </motion.div>

          {/* Productivity Snapshot */}
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="overlay-panel p-6"
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <BarChart3 className="text-secondary-400" size={20} />
                Productivity Snapshot
              </h3>
              <span className="text-xs font-bold text-primary-400 bg-primary-500/10 px-3 py-1 rounded-full">
                {productivityReport.focusScore}% focus
              </span>
            </div>

            <div className="space-y-5">
              {[
                { key: 'productive', label: 'Productive', color: 'bg-primary-500' },
                { key: 'unproductive', label: 'Unproductive', color: 'bg-accent' },
                { key: 'uncategorized', label: 'Neutral', color: 'bg-slate-500' },
              ].map(({ key, label, color }) => {
                const seconds = productivityReport.categories[key] || 0;
                const pct = productivityReport.total > 0 ? Math.round((seconds / productivityReport.total) * 100) : 0;
                return (
                  <div key={key} className="space-y-1.5">
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-400 font-semibold uppercase tracking-wider">{label}</span>
                      <span className="text-white font-bold">{formatDuration(seconds)} ({pct}%)</span>
                    </div>
                    <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                      <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} className={`h-full ${color}`} />
                    </div>
                  </div>
                );
              })}

              <div className="pt-4 border-t border-white/10 grid grid-cols-3 gap-3">
                <div className="text-center p-3 rounded-xl bg-white/5">
                  <Keyboard size={16} className="mx-auto text-slate-400 mb-1" />
                  <p className="text-lg font-bold text-white">{productivityReport.keystrokes}</p>
                  <p className="text-[10px] text-slate-500 uppercase">Keystrokes</p>
                </div>
                <div className="text-center p-3 rounded-xl bg-white/5">
                  <MousePointer size={16} className="mx-auto text-slate-400 mb-1" />
                  <p className="text-lg font-bold text-white">{productivityReport.clicks}</p>
                  <p className="text-[10px] text-slate-500 uppercase">Clicks</p>
                </div>
                <div className="text-center p-3 rounded-xl bg-white/5">
                  <Activity size={16} className="mx-auto text-slate-400 mb-1" />
                  <p className="text-lg font-bold text-white">{productivityReport.mouse}</p>
                  <p className="text-[10px] text-slate-500 uppercase">Mouse</p>
                </div>
              </div>

              {topApps[0] && (
                <div className="p-4 rounded-2xl bg-primary-500/5 border border-primary-500/20">
                  <p className="text-[10px] text-primary-400 font-bold uppercase tracking-widest mb-1">Top Focus App</p>
                  <p className="text-white font-semibold">{getAppDisplayName(topApps[0].app_name)}</p>
                  <p className="text-xs text-slate-400 mt-1">{topApps[0].percentage}% of tracked session</p>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};

export default ActivityPage;
