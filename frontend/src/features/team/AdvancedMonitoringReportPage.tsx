import { useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { ArrowLeft, ShieldAlert, Activity, Camera, Clock, Loader2, AlertTriangle } from 'lucide-react';
import { advancedMonitoringService, type AdvancedMonitoringReport } from '../../api/advancedMonitoringService';
import { teamService } from '../../api/teamService';
import { useAuthStore } from '../../store/authStore';
import { hasPermission } from '../../utils/access';
import { getAppDisplayName } from '../../utils/appIcons';

const AdvancedMonitoringReportPage = () => {
  const { userId } = useParams<{ userId: string }>();
  const { user } = useAuthStore();
  const [memberName, setMemberName] = useState('');
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [report, setReport] = useState<AdvancedMonitoringReport | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    teamService.getAll()
      .then((resp) => {
        const member = (resp.data ?? []).find((m) => Number(m.user_id ?? m.id) === Number(userId));
        if (member) setMemberName(`${member.first_name} ${member.last_name}`.trim());
      })
      .catch(() => undefined);
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    advancedMonitoringService.getReport(Number(userId), startDate, endDate)
      .then((resp) => {
        setReport(resp.data);
      })
      .catch(() => setReport(null))
      .finally(() => setLoading(false));
  }, [userId, startDate, endDate]);

  const summary = report?.summary;
  const unusual = report?.unusual_activity?.instances ?? [];

  if (!hasPermission(user, 'monitoring.advanced')) {
    return <Navigate to="/team" replace />;
  }

  return (
    <div className="space-y-8 pb-12">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link to="/team" className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white mb-3">
            <ArrowLeft size={16} /> Back to Team
          </Link>
          <h1 className="text-3xl font-extrabold text-white flex items-center gap-3">
            <ShieldAlert className="text-rose-400" size={28} />
            Advanced Monitoring Report
          </h1>
          <p className="text-slate-400 mt-1">{memberName || `Member #${userId}`}</p>
        </div>
        <div className="flex items-center gap-3">
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-10 bg-[#12141C] border border-white/10 rounded-xl px-3 text-white text-sm" />
          <span className="text-slate-500">to</span>
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="h-10 bg-[#12141C] border border-white/10 rounded-xl px-3 text-white text-sm" />
        </div>
      </div>

      {report?.active_session && (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-5 py-4 text-rose-100 text-sm">
          Advanced monitoring is <strong>active</strong> since {new Date(report.active_session.started_at).toLocaleString()}.
          {report.active_session.reason ? ` Reason: ${report.active_session.reason}` : ''}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-10 h-10 text-primary-500 animate-spin" /></div>
      ) : !report || !summary ? (
        <p className="text-slate-500">No report data available.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard icon={Activity} label="Productivity" value={`${summary.productivity_score}%`} sub={`${summary.productive_hours}h productive`} />
            <KpiCard icon={Clock} label="Idle time" value={`${summary.idle_percent.toFixed(0)}%`} sub={`${summary.idle_hours}h idle`} />
            <KpiCard icon={Camera} label="Screenshots" value={String(summary.screenshot_count)} sub={`Avg activity ${summary.avg_screenshot_activity}%`} />
            <KpiCard icon={ShieldAlert} label="Integrity" value={`${summary.integrity_score}`} sub={`Grade ${summary.integrity_grade}`} />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <section className="glass-card p-6">
              <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                <AlertTriangle size={18} className="text-amber-400" /> Unusual low-input windows
              </h2>
              {unusual.length === 0 ? (
                <p className="text-sm text-slate-500">No unusual activity detected in this period.</p>
              ) : (
                <ul className="space-y-3">
                  {unusual.slice(0, 8).map((item, idx) => (
                    <li key={idx} className="rounded-xl bg-white/5 border border-white/10 p-3 text-sm">
                      <div className="flex justify-between gap-2">
                        <span className="font-semibold text-amber-300 capitalize">{item.tier?.replace(/_/g, ' ')}</span>
                        <span className="text-slate-500">{item.duration_minutes ?? 0} min</span>
                      </div>
                      <p className="text-slate-400 mt-1">{item.start_at} – {item.end_at}</p>
                      {item.top_app && <p className="text-xs text-slate-500 mt-1">Top app: {getAppDisplayName(item.top_app)}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="glass-card p-6">
              <h2 className="text-lg font-bold text-white mb-4">Top apps</h2>
              <ul className="space-y-2">
                {(report.top_apps ?? []).slice(0, 8).map((app) => (
                  <li key={app.app_name} className="flex justify-between text-sm">
                    <span className="text-slate-300">{getAppDisplayName(app.app_name)}</span>
                    <span className="text-slate-500">{app.percentage}% · {app.category}</span>
                  </li>
                ))}
              </ul>
            </section>
          </div>

          <section className="glass-card p-6">
            <h2 className="text-lg font-bold text-white mb-4">Recent screenshots</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {(report.recent_screenshots ?? []).map((shot) => (
                <div key={shot.id} className="rounded-xl overflow-hidden border border-white/10 bg-black/30">
                  {shot.thumb_url ? (
                    <img src={shot.thumb_url} alt="" loading="lazy" className="w-full aspect-video object-cover" />
                  ) : (
                    <div className="w-full aspect-video bg-white/5 flex items-center justify-center text-slate-600 text-xs">No preview</div>
                  )}
                  <div className="p-2 text-[10px] text-slate-400 flex justify-between">
                    <span>{new Date(shot.captured_at).toLocaleString()}</span>
                    <span>{shot.activity_level}%</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
};

function KpiCard({ icon: Icon, label, value, sub }: { icon: typeof Activity; label: string; value: string; sub: string }) {
  return (
    <div className="glass-card p-5">
      <div className="flex items-center gap-2 text-slate-400 text-xs uppercase tracking-wider mb-2">
        <Icon size={14} /> {label}
      </div>
      <div className="text-3xl font-extrabold text-white">{value}</div>
      <div className="text-xs text-slate-500 mt-1">{sub}</div>
    </div>
  );
}

export default AdvancedMonitoringReportPage;
