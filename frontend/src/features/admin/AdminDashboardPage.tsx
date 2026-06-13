import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Building2, Users, DollarSign, Activity, Loader2 } from 'lucide-react';
import { adminService } from '../../api/adminService';

const AdminDashboardPage = () => {
  const [orgs, setOrgs] = useState<any[]>([]);
  const [stats, setStats] = useState<any[]>([]);
  const [activity, setActivity] = useState<any>({ active_sessions: [], recent_sessions: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      adminService.getOrganizations(),
      adminService.getSubscriptionStats(),
      adminService.getActivityOverview(),
    ])
      .then(([orgsResp, statsResp, activityResp]) => {
        setOrgs(orgsResp.data ?? []);
        setStats(statsResp.data ?? []);
        setActivity(activityResp.data ?? { active_sessions: [], recent_sessions: [] });
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary-400" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">Platform Admin</h1>
        <p className="text-slate-400">Overview of all organizations, subscriptions, and live activity.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-white/5 border border-white/10 rounded-2xl p-6">
          <Building2 className="text-primary-400 mb-3" />
          <p className="text-sm text-slate-400">Organizations</p>
          <p className="text-3xl font-bold text-white">{orgs.length}</p>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-white/5 border border-white/10 rounded-2xl p-6">
          <Users className="text-primary-400 mb-3" />
          <p className="text-sm text-slate-400">Active Sessions</p>
          <p className="text-3xl font-bold text-white">{activity.active_sessions?.length ?? 0}</p>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="bg-white/5 border border-white/10 rounded-2xl p-6">
          <DollarSign className="text-primary-400 mb-3" />
          <p className="text-sm text-slate-400">Plan Types</p>
          <p className="text-3xl font-bold text-white">{stats.length}</p>
        </motion.div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
          <h2 className="text-lg font-bold text-white mb-4">Organizations</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-slate-500 text-left border-b border-white/10">
                  <th className="pb-3">Name</th>
                  <th className="pb-3">Plan</th>
                  <th className="pb-3">Members</th>
                  <th className="pb-3">Timezone</th>
                </tr>
              </thead>
              <tbody>
                {orgs.map((org) => (
                  <tr key={org.id} className="border-b border-white/5 text-slate-300">
                    <td className="py-3 font-medium text-white">{org.name}</td>
                    <td className="py-3">{org.plan_name}</td>
                    <td className="py-3">{org.member_count}</td>
                    <td className="py-3">{org.php_timezone}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
          <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <Activity size={18} className="text-primary-400" />
            Live Activity
          </h2>
          <div className="space-y-3 max-h-80 overflow-y-auto">
            {(activity.active_sessions ?? []).map((s: any) => (
              <div key={s.id} className="p-3 rounded-xl bg-primary-500/5 border border-primary-500/10">
                <p className="text-sm font-medium text-white">{s.first_name} {s.last_name}</p>
                <p className="text-xs text-slate-400">{s.org_name} · started {s.started_at}</p>
              </div>
            ))}
            {(activity.active_sessions ?? []).length === 0 && (
              <p className="text-sm text-slate-500">No active sessions right now.</p>
            )}
          </div>
        </div>
      </div>

      <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
        <h2 className="text-lg font-bold text-white mb-4">Subscription Breakdown</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {stats.map((s: any) => (
            <div key={s.slug} className="p-4 rounded-xl bg-white/5 border border-white/10">
              <p className="font-bold text-white">{s.name}</p>
              <p className="text-2xl font-bold text-primary-400 mt-1">{s.org_count}</p>
              <p className="text-xs text-slate-500">orgs · ${Number(s.total_revenue).toFixed(0)} revenue</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default AdminDashboardPage;
