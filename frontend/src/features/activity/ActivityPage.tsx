import { motion } from 'framer-motion';
import { Activity, AppWindow, Globe, Clock, Search, Filter, TrendingUp, RefreshCw } from 'lucide-react';
import { Button } from '../../components/ui';
import { activityService } from '../../api/activityService';
import React, { useState, useEffect } from 'react';

const ActivityPage = () => {
  const [logs, setLogs] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchLogs = async () => {
    try {
      setIsLoading(true);
      const response = await activityService.getAll();
      setLogs(response.data);
    } catch (error) {
      console.error('Failed to fetch activity logs', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  // Process logs for top apps visualization
  const topApps = logs.reduce((acc: any[], log: any) => {
    const existing = acc.find(a => a.name === log.app_name);
    if (existing) {
      existing.duration_seconds += 10; // Simulation assumption
    } else {
      acc.push({ name: log.app_name, duration_seconds: 10, status: log.category });
    }
    return acc;
  }, []).sort((a, b) => b.duration_seconds - a.duration_seconds).slice(0, 5);

  const totalTime = topApps.reduce((sum, app) => sum + app.duration_seconds, 0);

  // Process logs for top URLs
  const topUrls = logs.filter(log => log.url).reduce((acc: any[], log: any) => {
    const existing = acc.find(u => u.name === log.url);
    if (existing) {
      existing.duration_seconds += 10;
      existing.visits += 1;
    } else {
      acc.push({ name: log.url, duration_seconds: 10, visits: 1, status: log.category });
    }
    return acc;
  }, []).sort((a, b) => b.duration_seconds - a.duration_seconds).slice(0, 5);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2 flex items-center gap-2">
            <Activity className="text-primary-400" />
            Activity Logs
          </h1>
          <p className="text-slate-400">Deep dive into application and website usage patterns.</p>
        </div>
        
        <div className="flex gap-4">
          <Button variant="secondary" size="sm" onClick={fetchLogs} isLoading={isLoading}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input 
              type="text" 
              placeholder="Search..." 
              className="bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-2 text-sm text-white focus:outline-none focus:border-primary-500/50 min-w-[200px]"
            />
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <RefreshCw className="w-8 h-8 text-primary-500 animate-spin" />
        </div>
      ) : logs.length === 0 ? (
        <div className="glass-card flex flex-col items-center justify-center py-20 text-center">
          <Activity className="w-16 h-16 text-slate-700 mb-4" />
          <h3 className="text-xl font-bold text-white mb-2">No activity recorded</h3>
          <p className="text-slate-400 max-w-sm">
            Activity logs will appear here once the timer is started and you begin working.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Top Apps */}
          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="glass-card"
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <AppWindow className="text-primary-400" size={20} />
                Top Applications
              </h3>
              <span className="text-xs font-bold text-primary-400 bg-primary-500/10 px-3 py-1 rounded-full uppercase tracking-widest">Live Now</span>
            </div>

            <div className="space-y-6">
              {topApps.map((app) => {
                const percentage = totalTime > 0 ? Math.round((app.duration_seconds / totalTime) * 100) : 0;
                return (
                  <div key={app.name} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center border border-white/10">
                          <span className="text-lg">{app.name[0]}</span>
                        </div>
                        <div>
                          <p className="font-semibold text-white">{app.name}</p>
                          <p className="text-xs text-slate-500 capitalize">{app.status}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-white tracking-tight">{Math.floor(app.duration_seconds / 60)}m {app.duration_seconds % 60}s</p>
                        <p className="text-[10px] text-slate-500">{percentage}% of session</p>
                      </div>
                    </div>
                    <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${percentage}%` }}
                        className={`h-full ${
                          app.status === 'productive' ? 'bg-primary-500 shadow-primary' : 
                          app.status === 'unproductive' ? 'bg-accent shadow-accent' : 
                          'bg-slate-500'
                        }`}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>

          {/* Top URLs */}
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="glass-card"
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Globe className="text-secondary-400" size={20} />
                Web Activity
              </h3>
              <TrendingUp className="text-green-400" size={18} />
            </div>

            <div className="space-y-4">
              {topUrls.map((url) => (
                <div key={url.name} className="p-4 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors group cursor-pointer">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-secondary-500/10 flex items-center justify-center text-secondary-400">
                        <Globe size={16} />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-white group-hover:text-primary-400 transition-colors">{url.name}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className={`w-1.5 h-1.5 rounded-full ${url.status === 'productive' ? 'bg-green-500' : 'bg-red-500'}`}></span>
                          <span className="text-[10px] text-slate-500 uppercase tracking-tighter capitalize">{url.status}</span>
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="flex items-center gap-2 justify-end">
                        <Clock size={12} className="text-slate-500" />
                        <span className="text-sm font-bold text-white">{Math.floor(url.duration_seconds / 60)}m</span>
                      </div>
                      <span className="text-[10px] text-slate-500">{url.visits} direct visits</span>
                    </div>
                  </div>
                </div>
              ))}
              {topUrls.length === 0 && (
                <p className="text-center text-slate-500 py-10 text-sm italic">No web activity recorded in this session.</p>
              )}
            </div>

            <Button variant="secondary" className="w-full mt-6">
              View Full Web History
            </Button>
          </motion.div>
        </div>
      )}
    </div>
  );
};

export default ActivityPage;
