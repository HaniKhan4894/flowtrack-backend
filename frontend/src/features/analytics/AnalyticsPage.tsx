import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { 
  BarChart3, 
  TrendingUp, 
  Users, 
  Clock, 
  Download, 
  ArrowUpRight,
  Globe,
  Moon,
  DollarSign,
  Calendar,
  MapPin,
} from 'lucide-react';
import { useNavigate, Link } from 'react-router-dom';
import { reportService, type TimeSummary, type ProjectBreakdown, type TeamLeaderboard, type TopUrl, type OrgProductivityMember, type IdleBreakdownUser, type ProjectProfitability } from '../../api/reportService';
import { officeLocationService, type LocationBreakdown } from '../../api/officeLocationService';
import { useAuthStore } from '../../store/authStore';
import { canViewMemberTracking, hasPermission } from '../../utils/access';
import { PageSkeleton } from '../../components/ui';

function buildRangeParams(filterRange: 'today' | '7days' | '30days' | 'month', startDate: string, endDate: string) {
  const params: Record<string, string> = {};

  if (startDate && endDate) {
    params.start_date = startDate;
    params.end_date = endDate;
    return params;
  }

  const now = new Date();
  const today = now.toISOString().split('T')[0];
  params.end_date = today;

  if (filterRange === 'today') {
    params.start_date = today;
  } else if (filterRange === '7days') {
    const d = new Date();
    d.setDate(d.getDate() - 6);
    params.start_date = d.toISOString().split('T')[0];
  } else if (filterRange === '30days') {
    const d = new Date();
    d.setDate(d.getDate() - 29);
    params.start_date = d.toISOString().split('T')[0];
  } else if (filterRange === 'month') {
    const d = new Date();
    d.setDate(1);
    params.start_date = d.toISOString().split('T')[0];
  }

  return params;
}

const AnalyticsPage = () => {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const canTrackMembers = canViewMemberTracking(user);
  const [summary, setSummary] = useState<TimeSummary | null>(null);
  const [projects, setProjects] = useState<ProjectBreakdown[]>([]);
  const [leaderboard, setLeaderboard] = useState<TeamLeaderboard[]>([]);
  const [topUrls, setTopUrls] = useState<TopUrl[]>([]);
  const [orgProductivity, setOrgProductivity] = useState<OrgProductivityMember[]>([]);
  const [idleBreakdown, setIdleBreakdown] = useState<IdleBreakdownUser[]>([]);
  const [locationBreakdown, setLocationBreakdown] = useState<LocationBreakdown[]>([]);
  const [profitability, setProfitability] = useState<ProjectProfitability[]>([]);
  const [exportFormat, setExportFormat] = useState<'csv' | 'pdf' | 'xlsx'>('csv');
  const canExport = hasPermission(user, 'reports.export');
  const canViewTeamReports = hasPermission(user, 'reports.view_team');
  const [loading, setLoading] = useState(true);

  const [filterRange, setFilterRange] = useState<'today' | '7days' | '30days' | 'month'>('7days');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = buildRangeParams(filterRange, startDate, endDate);

      const [sumResp, projResp, leadResp] = await Promise.all([
        reportService.getTimeSummary(params),
        reportService.getProjectBreakdown(params),
        reportService.getTeamLeaderboard(params),
      ]);
      setSummary(sumResp.data);
      setProjects(projResp.data ?? []);
      setLeaderboard(leadResp.data ?? []);

      if (canViewTeamReports && params.start_date && params.end_date) {
        const [urlsResp, prodResp, idleResp, profitResp, locResp] = await Promise.all([
          reportService.getTopUrls({ start_date: params.start_date, end_date: params.end_date }).catch(() => ({ data: { urls: [] } })),
          reportService.getOrgProductivity({ start_date: params.start_date, end_date: params.end_date }).catch(() => ({ data: { members: [] } })),
          reportService.getIdleBreakdown({ start_date: params.start_date, end_date: params.end_date }).catch(() => ({ data: { users: [] } })),
          reportService.getProjectProfitability({ start_date: params.start_date, end_date: params.end_date }).catch(() => ({ data: { projects: [] } })),
          officeLocationService.breakdown(params.start_date, params.end_date).catch(() => ({ data: [] })),
        ]);
        setTopUrls(urlsResp.data?.urls ?? []);
        setOrgProductivity(prodResp.data?.members ?? []);
        setIdleBreakdown(idleResp.data?.users ?? []);
        setProfitability(profitResp.data?.projects ?? []);
        setLocationBreakdown(locResp.data ?? []);
      } else {
        setTopUrls([]);
        setOrgProductivity([]);
        setIdleBreakdown([]);
        setProfitability([]);
        setLocationBreakdown([]);
      }
    } catch (e) {
      console.error('Failed to fetch analytics', e);
      setSummary({ total_entries: 0, total_hours: 0, avg_hours: 0, billable_hours: 0, non_billable_hours: 0 });
      setProjects([]);
      setLeaderboard([]);
    } finally {
      setLoading(false);
    }
  }, [filterRange, startDate, endDate, canViewTeamReports]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const getRangeLabel = () => {
    if (startDate && endDate) return `${startDate} → ${endDate}`;
    if (filterRange === 'today') return 'Today';
    if (filterRange === '7days') return 'Last 7 Days';
    if (filterRange === '30days') return 'Last 30 Days';
    if (filterRange === 'month') return 'This Month';
    return 'Custom Range';
  };

  const handleRangeClick = (range: typeof filterRange) => {
    setFilterRange(range);
    setStartDate('');
    setEndDate('');
  };

  const handleExport = () => {
    const reportData = [
      { metric: 'total_hours', value: summary?.total_hours ?? 0 },
      { metric: 'billable_hours', value: summary?.billable_hours ?? 0 },
      { metric: 'non_billable_hours', value: summary?.non_billable_hours ?? 0 },
    ];
    const base = `analytics_report.${exportFormat === 'xlsx' ? 'xlsx' : exportFormat === 'pdf' ? 'pdf' : 'csv'}`;
    if (exportFormat === 'pdf') reportService.exportPdf(base, reportData, 'Analytics Report');
    else if (exportFormat === 'xlsx') reportService.exportExcel(base, reportData);
    else reportService.exportCsv(base, reportData);
  };

  const productivityPct = summary && summary.total_hours > 0
    ? Math.round((summary.billable_hours / summary.total_hours) * 100)
    : 0;

  return (
    <div className="space-y-8 pb-12">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Internal Analytics</h1>
          <p className="text-slate-400">Advanced insights into team productivity and project health.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex bg-white/5 rounded-xl border border-white/10 p-1">
            {(['today', '7days', 'month'] as const).map((range) => (
              <button
                key={range}
                type="button"
                onClick={() => handleRangeClick(range)}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                  filterRange === range && !startDate ? 'bg-primary-500 text-white shadow-lg' : 'text-slate-400 hover:text-white'
                }`}
              >
                {range === 'month' ? 'This Month' : range === '7days' ? 'Last 7 Days' : 'Today'}
              </button>
            ))}
          </div>

          {canExport && (
            <>
              <select
                value={exportFormat}
                onChange={(e) => setExportFormat(e.target.value as 'csv' | 'pdf' | 'xlsx')}
                className="h-10 bg-[#12141C] border border-white/10 rounded-xl px-3 text-sm text-white"
              >
                <option value="csv">CSV</option>
                <option value="pdf">PDF</option>
                <option value="xlsx">Excel</option>
              </select>
              <button
                type="button"
                onClick={handleExport}
                className="flex items-center gap-2 bg-primary-500 hover:bg-primary-600 text-white px-5 py-2.5 rounded-xl font-bold transition-all shadow-ai"
              >
                <Download size={18} />
                Export
              </button>
            </>
          )}
        </div>
      </div>

      {loading && summary === null ? <PageSkeleton /> : (
      <>
      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[
          { label: 'Total Tracked', value: `${summary?.total_hours ?? 0}h`, icon: Clock, change: `${summary?.total_entries ?? 0} entries`, up: true },
          { label: 'Billable Ratio', value: `${productivityPct}%`, icon: TrendingUp, change: `${summary?.billable_hours ?? 0}h billable`, up: productivityPct >= 50 },
          { label: 'Billable Amount', value: `$${Math.round((summary?.billable_hours || 0) * 50)}`, icon: ArrowUpRight, change: `@ $50/hr`, up: true },
          { label: 'Active Members', value: leaderboard.length.toString(), icon: Users, change: getRangeLabel(), up: true },
        ].map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="overlay-panel p-6"
          >
            <div className="flex justify-between items-start mb-4">
              <div className="p-3 rounded-xl bg-white/5 text-primary-400">
                <stat.icon size={20} />
              </div>
              <div className={`flex items-center gap-1 text-xs font-bold ${stat.up ? 'text-emerald-400' : 'text-rose-400'}`}>
                {stat.change}
              </div>
            </div>
            <h3 className="text-slate-400 text-sm font-medium mb-1 uppercase tracking-wider">{stat.label}</h3>
            <p className="text-2xl font-bold text-white">{loading ? '…' : stat.value}</p>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Project Breakdown */}
        <div className="lg:col-span-2 overlay-panel p-8">
          <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
            <div className="flex items-center gap-4">
              <div className="p-4 rounded-2xl bg-primary-500/10 text-primary-400 shadow-inner">
                <BarChart3 size={24} />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">Project Distribution</h2>
                <p className="text-xs text-slate-500 uppercase font-bold tracking-widest">{getRangeLabel()}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 bg-[#12141C] border border-white/10 rounded-xl px-3 py-1.5">
                <Calendar size={14} className="text-slate-500" />
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="bg-transparent border-0 text-[10px] text-slate-300 p-0 focus:ring-0 uppercase font-bold w-28"
                />
                <span className="text-slate-600">-</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="bg-transparent border-0 text-[10px] text-slate-300 p-0 focus:ring-0 uppercase font-bold w-28"
                />
              </div>
              {(startDate || endDate) && (
                <button
                  type="button"
                  onClick={() => { setStartDate(''); setEndDate(''); }}
                  className="text-[10px] font-bold text-primary-400 hover:underline uppercase"
                >
                  Reset
                </button>
              )}
            </div>
          </div>

          <div className="space-y-8">
            {loading ? (
              <p className="text-slate-500 text-center py-12">Loading…</p>
            ) : projects.length > 0 ? (
              projects.map((proj, i) => {
                const maxHours = Math.max(...projects.map((p) => p.total_hours), 1);
                const percentage = (proj.total_hours / maxHours) * 100;
                return (
                  <div key={proj.id ?? i} className="space-y-3">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-3">
                        <div className="w-2 h-10 rounded-full bg-primary-500" />
                        <div>
                          <span className="font-bold text-slate-100 block">{proj.name || 'Unassigned'}</span>
                          <span className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">{proj.entries_count} entries</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-white font-mono font-bold block">{proj.total_hours}h</span>
                      </div>
                    </div>
                    <div className="h-3 bg-white/5 rounded-full overflow-hidden p-0.5">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${percentage}%` }}
                        transition={{ duration: 1, delay: i * 0.1, ease: 'easeOut' }}
                        className="h-full bg-gradient-to-r from-primary-600 to-primary-400 rounded-full"
                      />
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="py-12 text-center">
                <p className="text-slate-500 font-medium">No project time logged for {getRangeLabel()}.</p>
                <p className="text-xs text-slate-600 mt-2">Start tracking time on projects to see distribution here.</p>
              </div>
            )}
          </div>
        </div>

        {/* Team Leaderboard */}
        <div className="overlay-panel p-8 flex flex-col">
          <div className="flex items-center gap-4 mb-8">
            <div className="p-4 rounded-2xl bg-secondary-500/10 text-secondary-400 shadow-inner">
              <Users size={24} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Team Performance</h2>
              <p className="text-xs text-slate-500 uppercase font-bold tracking-widest">Top Contributors</p>
            </div>
          </div>

          <div className="flex-1 space-y-6">
            {loading ? (
              <p className="text-slate-500 text-sm">Loading…</p>
            ) : leaderboard.length > 0 ? (
              leaderboard.map((member, i) => (
                <div key={member.id} className="flex items-center gap-4 group">
                  <div className="relative">
                    <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center text-primary-400 font-bold text-sm border border-white/5">
                      {member.first_name[0]}{member.last_name[0]}
                    </div>
                    <div className="absolute -top-2 -right-2 w-6 h-6 rounded-lg bg-[#12141C] border border-white/10 flex items-center justify-center text-xs font-bold text-amber-500">
                      #{i + 1}
                    </div>
                  </div>
                  <div className="flex-1">
                    <h4 className="text-sm font-bold text-white">
                      {member.first_name} {member.last_name}
                    </h4>
                    <span className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">{member.entries_count} logs</span>
                  </div>
                  <div className="text-right flex items-center gap-3">
                    <p className="text-sm font-bold text-primary-400 font-mono">{member.total_hours}h</p>
                    {canTrackMembers && (
                      <Link to={`/team/member/${member.id}`} className="text-[10px] font-bold text-primary-400 hover:underline uppercase">
                        Track
                      </Link>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <p className="text-slate-500 text-sm text-center py-8">No team activity for this period.</p>
            )}
          </div>

          <button
            type="button"
            onClick={() => navigate('/team')}
            className="mt-12 w-full py-3 bg-white/5 hover:bg-white/10 border border-white/5 rounded-2xl text-xs font-bold text-slate-400 hover:text-white transition-all uppercase tracking-widest"
          >
            Full Team Report
          </button>
        </div>
      </div>

      {canViewTeamReports && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="overlay-panel p-8">
            <div className="flex items-center gap-4 mb-6">
              <div className="p-3 rounded-xl bg-primary-500/10 text-primary-400"><Globe size={22} /></div>
              <h2 className="text-xl font-bold text-white">Top Websites</h2>
            </div>
            <div className="space-y-4">
              {topUrls.length > 0 ? topUrls.slice(0, 8).map((u, i) => (
                <div key={i} className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-200 truncate max-w-[70%]">{u.url}</span>
                    <span className="text-primary-400 font-mono">{u.total_hours}h</span>
                  </div>
                  <div className="h-1.5 bg-white/5 rounded-full"><div className="h-full bg-primary-500 rounded-full" style={{ width: `${u.percentage}%` }} /></div>
                </div>
              )) : <p className="text-slate-500 text-sm">No URL activity for this period.</p>}
            </div>
          </div>

          <div className="overlay-panel p-8">
            <div className="flex items-center gap-4 mb-6">
              <div className="p-3 rounded-xl bg-emerald-500/10 text-emerald-400"><TrendingUp size={22} /></div>
              <h2 className="text-xl font-bold text-white">Org Productivity</h2>
            </div>
            <div className="space-y-3">
              {orgProductivity.slice(0, 8).map((m) => (
                <div key={m.user_id} className="flex items-center justify-between p-3 rounded-xl bg-white/5">
                  <span className="text-white font-medium">{m.first_name} {m.last_name}</span>
                  <span className="text-emerald-400 font-bold">{m.productivity_score}%</span>
                </div>
              ))}
              {orgProductivity.length === 0 && <p className="text-slate-500 text-sm">No productivity data.</p>}
            </div>
          </div>

          <div className="overlay-panel p-8">
            <div className="flex items-center gap-4 mb-6">
              <div className="p-3 rounded-xl bg-amber-500/10 text-amber-400"><Moon size={22} /></div>
              <h2 className="text-xl font-bold text-white">Idle Breakdown</h2>
            </div>
            <div className="space-y-3">
              {idleBreakdown.slice(0, 8).map((u) => (
                <div key={u.user_id} className="flex items-center justify-between p-3 rounded-xl bg-white/5">
                  <span className="text-white font-medium">{u.first_name} {u.last_name}</span>
                  <span className="text-amber-400 font-mono">{u.idle_hours ?? Math.round(u.idle_seconds / 3600 * 10) / 10}h idle</span>
                </div>
              ))}
              {idleBreakdown.length === 0 && <p className="text-slate-500 text-sm">No idle data recorded.</p>}
            </div>
          </div>

          <div className="overlay-panel p-8">
            <div className="flex items-center gap-4 mb-6">
              <div className="p-3 rounded-xl bg-primary-500/10 text-primary-400"><MapPin size={22} /></div>
              <h2 className="text-xl font-bold text-white">Remote vs In-Office</h2>
            </div>
            <div className="space-y-3">
              {locationBreakdown.map((row) => (
                <div key={row.work_location} className="flex items-center justify-between p-3 rounded-xl bg-white/5">
                  <span className="text-white font-medium capitalize">{row.work_location}</span>
                  <span className="text-primary-400 font-bold">{row.hours}h · {row.percent}%</span>
                </div>
              ))}
              {locationBreakdown.length === 0 && <p className="text-slate-500 text-sm">No location data yet. Configure office locations in Settings.</p>}
            </div>
          </div>

          <div className="overlay-panel p-8">
            <div className="flex items-center gap-4 mb-6">
              <div className="p-3 rounded-xl bg-secondary-500/10 text-secondary-400"><DollarSign size={22} /></div>
              <h2 className="text-xl font-bold text-white">Project Profitability</h2>
            </div>
            <div className="space-y-3">
              {profitability.slice(0, 8).map((p) => (
                <div key={p.project_id} className="p-3 rounded-xl bg-white/5">
                  <div className="flex justify-between">
                    <span className="text-white font-medium">{p.project_name}</span>
                    <span className={`font-bold ${(p.margin ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {p.margin != null ? `$${p.margin}` : '—'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">{p.billable_hours}h billable · rev {p.estimated_revenue != null ? `$${p.estimated_revenue}` : '—'}</p>
                </div>
              ))}
              {profitability.length === 0 && <p className="text-slate-500 text-sm">No profitability data.</p>}
            </div>
          </div>
        </div>
      )}
      </>
      )}
    </div>
  );
};

export default AnalyticsPage;
