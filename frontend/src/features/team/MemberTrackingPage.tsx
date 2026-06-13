import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Clock, Camera, Activity, Loader2 } from 'lucide-react';
import { timeService } from '../../api/timeService';
import { screenshotService } from '../../api/screenshotService';
import { activityService } from '../../api/activityService';

const MemberTrackingPage = () => {
  const { userId } = useParams<{ userId: string }>();
  const [timeEntries, setTimeEntries] = useState<any[]>([]);
  const [screenshots, setScreenshots] = useState<any[]>([]);
  const [activityLogs, setActivityLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    const uid = Number(userId);
    Promise.all([
      timeService.getAll({ user_id: uid, per_page: 20 }),
      screenshotService.getAll({ user_id: uid, per_page: 12 }),
      activityService.getAll({ user_id: uid, per_page: 20 }),
    ])
      .then(([timeResp, ssResp, actResp]) => {
        setTimeEntries(timeResp.data ?? []);
        setScreenshots(ssResp.data ?? []);
        setActivityLogs(actResp.data ?? []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [userId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary-400" />
      </div>
    );
  }

  const formatDuration = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${h}h ${m}m`;
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-4">
        <Link to="/team" className="p-2 rounded-xl bg-white/5 border border-white/10 text-slate-400 hover:text-white">
          <ArrowLeft size={18} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-white">Member Tracking</h1>
          <p className="text-slate-400 text-sm">User ID: {userId}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        <section className="xl:col-span-1 bg-white/5 border border-white/10 rounded-2xl p-6">
          <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2"><Clock size={18} className="text-primary-400" /> Time Entries</h2>
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {timeEntries.map((e) => (
              <div key={e.id} className="p-3 rounded-xl bg-white/5 border border-white/5">
                <p className="text-sm font-medium text-white">{e.description || 'Untitled session'}</p>
                <p className="text-xs text-slate-400">{e.started_at_local ?? e.started_at}</p>
                <p className="text-xs text-primary-400">{formatDuration(e.duration_seconds || 0)}</p>
              </div>
            ))}
            {timeEntries.length === 0 && <p className="text-sm text-slate-500">No time entries.</p>}
          </div>
        </section>

        <section className="xl:col-span-1 bg-white/5 border border-white/10 rounded-2xl p-6">
          <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2"><Camera size={18} className="text-primary-400" /> Screenshots</h2>
          <div className="grid grid-cols-2 gap-3 max-h-96 overflow-y-auto">
            {screenshots.map((s) => (
              <div key={s.id} className="p-2 rounded-xl bg-white/5 border border-white/5 text-center">
                <p className="text-[10px] text-slate-400">{s.captured_at_local ?? s.captured_at}</p>
                <p className="text-xs text-primary-400 mt-1">{s.activity_level}% activity</p>
              </div>
            ))}
            {screenshots.length === 0 && <p className="text-sm text-slate-500 col-span-2">No screenshots.</p>}
          </div>
        </section>

        <section className="xl:col-span-1 bg-white/5 border border-white/10 rounded-2xl p-6">
          <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2"><Activity size={18} className="text-primary-400" /> Activity</h2>
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {activityLogs.map((a) => (
              <div key={a.id} className="p-3 rounded-xl bg-white/5 border border-white/5">
                <p className="text-sm font-medium text-white">{a.app_name}</p>
                <p className="text-xs text-slate-400 truncate">{a.window_title}</p>
                <p className="text-xs text-slate-500">{a.logged_at_local ?? a.logged_at} · {a.category}</p>
              </div>
            ))}
            {activityLogs.length === 0 && <p className="text-sm text-slate-500">No activity logs.</p>}
          </div>
        </section>
      </div>
    </div>
  );
};

export default MemberTrackingPage;
