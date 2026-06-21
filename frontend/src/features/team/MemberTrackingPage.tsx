import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Clock, Camera, Activity, Loader2, ExternalLink } from 'lucide-react';
import { timeService } from '../../api/timeService';
import { screenshotService } from '../../api/screenshotService';
import { activityService } from '../../api/activityService';
import { teamService } from '../../api/teamService';
import { useAuthStore } from '../../store/authStore';
import { hasPermission } from '../../utils/access';
import { getAppDisplayName } from '../../utils/appIcons';
import { getBrowserTabDisplayName } from '../../utils/browserTabName';

const MemberTrackingPage = () => {
  const { userId } = useParams<{ userId: string }>();
  const { user } = useAuthStore();
  const [memberName, setMemberName] = useState('');
  const [timeEntries, setTimeEntries] = useState<any[]>([]);
  const [screenshots, setScreenshots] = useState<any[]>([]);
  const [activityLogs, setActivityLogs] = useState<any[]>([]);
  const [thumbUrls, setThumbUrls] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);

  const today = new Date().toISOString().split('T')[0];

  const revokeThumbs = useCallback((urls: Record<number, string>) => {
    Object.values(urls).forEach((url) => {
      if (url) URL.revokeObjectURL(url);
    });
  }, []);

  useEffect(() => {
    if (!userId) return;
    const uid = Number(userId);

    teamService.getAll()
      .then((resp) => {
        const member = (resp.data ?? []).find((m) => Number(m.id) === uid || Number(m.user_id) === uid);
        if (member) {
          setMemberName(`${member.first_name} ${member.last_name}`.trim());
        }
      })
      .catch(() => undefined);

    const range = {
      user_id: uid,
      start_date: `${today} 00:00:00`,
      end_date: `${today} 23:59:59`,
    };

    Promise.all([
      timeService.getAll({ user_id: uid, per_page: 20 }),
      screenshotService.getAll({ ...range, per_page: 12 }),
      activityService.getAll({ ...range, per_page: 20 }),
    ])
      .then(async ([timeResp, ssResp, actResp]) => {
        const shots = ssResp.data ?? [];
        setTimeEntries(timeResp.data ?? []);
        setScreenshots(shots);
        setActivityLogs(actResp.data ?? []);

        setThumbUrls((prev) => {
          revokeThumbs(prev);
          return {};
        });

        const entries = await Promise.all(
          shots.map(async (item: any) => {
            try {
              const blobUrl = await screenshotService.getThumbnailBlobUrl(item.id);
              return [item.id, blobUrl] as const;
            } catch {
              return [item.id, ''] as const;
            }
          })
        );
        setThumbUrls(Object.fromEntries(entries));
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [userId, today, revokeThumbs]);

  useEffect(() => () => revokeThumbs(thumbUrls), [thumbUrls, revokeThumbs]);

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

  const formatActivityLabel = (log: any) => {
    const app = getAppDisplayName(log.app_name || '');
    const isBrowser = /chrome|firefox|edge|msedge|brave|opera|safari/i.test(`${log.app_name} ${log.window_title}`);
    if (isBrowser && log.window_title) {
      return getBrowserTabDisplayName(log.window_title, log.url);
    }
    return app;
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4">
          <Link to="/team" className="p-2 rounded-xl bg-white/5 border border-white/10 text-slate-400 hover:text-white">
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-white">Member Tracking</h1>
            <p className="text-slate-400 text-sm">
              {memberName || `User #${userId}`} · Today
            </p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          {hasPermission(user, 'monitoring.advanced') && (
            <Link to={`/team/member/${userId}/advanced-monitoring`} className="text-xs font-bold text-rose-400 hover:underline flex items-center gap-1">
              Advanced report <ExternalLink size={12} />
            </Link>
          )}
          <Link to={`/screenshots?user=${userId}`} className="text-xs font-bold text-primary-400 hover:underline flex items-center gap-1">
            All screenshots <ExternalLink size={12} />
          </Link>
          <Link to={`/activity?user=${userId}`} className="text-xs font-bold text-primary-400 hover:underline flex items-center gap-1">
            All activity <ExternalLink size={12} />
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        <section className="xl:col-span-1 bg-white/5 border border-white/10 rounded-2xl p-6">
          <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <Clock size={18} className="text-primary-400" /> Time Entries
          </h2>
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
          <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <Camera size={18} className="text-primary-400" /> Screenshots
          </h2>
          <div className="grid grid-cols-2 gap-3 max-h-96 overflow-y-auto">
            {screenshots.map((s) => {
              const thumb = thumbUrls[s.id];
              return (
                <div key={s.id} className="rounded-xl bg-white/5 border border-white/5 overflow-hidden">
                  <div className="aspect-video bg-slate-900">
                    {thumb ? (
                      <img src={thumb} alt="" className="w-full h-full object-cover" loading="lazy" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-[10px] text-slate-500">Loading…</div>
                    )}
                  </div>
                  <div className="p-2 text-center">
                    <p className="text-[10px] text-slate-400">
                      {new Date(s.captured_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                    <p className="text-[10px] text-primary-400">{s.activity_level}%</p>
                  </div>
                </div>
              );
            })}
            {screenshots.length === 0 && <p className="text-sm text-slate-500 col-span-2">No screenshots today.</p>}
          </div>
        </section>

        <section className="xl:col-span-1 bg-white/5 border border-white/10 rounded-2xl p-6">
          <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <Activity size={18} className="text-primary-400" /> Activity
          </h2>
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {activityLogs.map((a) => (
              <div key={a.id} className="p-3 rounded-xl bg-white/5 border border-white/5">
                <p className="text-sm font-medium text-white">{formatActivityLabel(a)}</p>
                <p className="text-xs text-slate-500 capitalize">{a.category || 'uncategorized'}</p>
                <p className="text-xs text-slate-400">
                  {new Date(a.logged_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  {a.duration_seconds ? ` · ${formatDuration(a.duration_seconds)}` : ''}
                </p>
              </div>
            ))}
            {activityLogs.length === 0 && <p className="text-sm text-slate-500">No activity today.</p>}
          </div>
        </section>
      </div>
    </div>
  );
};

export default MemberTrackingPage;
