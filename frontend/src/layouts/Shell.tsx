import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LogOut,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Bell,
} from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { TimerWidget } from '../components/TimerWidget';
import { notificationService } from '../api/notificationService';
import { useTimerStore } from '../store/timerStore';
import { timeService } from '../api/timeService';
import { getNavItemsForUser } from '../utils/access';
import { hardRedirectToLogin, isDesktopApp } from '../utils/electronAuth';
import { WindowControls } from '../components/WindowControls';

const SidebarItem = ({ icon: Icon, label, path, isCollapsed }: any) => {
  const location = useLocation();
  const isActive = location.pathname === path;

  return (
    <Link to={path}>
      <motion.div
        whileHover={{ x: 4 }}
        className={`flex items-center gap-3 px-4 py-3 rounded-2xl transition-all duration-300 group
          ${isActive 
            ? 'bg-primary-500/10 text-primary-400 border border-primary-500/20 shadow-ai' 
            : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
      >
        <Icon className={`w-5 h-5 ${isActive ? 'text-primary-400' : 'group-hover:text-primary-400'} transition-colors`} />
        {!isCollapsed && (
          <span className="font-medium whitespace-nowrap">{label}</span>
        )}
      </motion.div>
    </Link>
  );
};

export const Shell = ({ children }: { children: React.ReactNode }) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const { resetLocal } = useTimerStore();
  const [notifications, setNotifications] = useState<any[]>([]);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const navItems = getNavItemsForUser(user);

  const handleLogout = () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);

    const activeEntryId = useTimerStore.getState().activeEntry?.id;
    resetLocal();

    if (activeEntryId) {
      void timeService.stopTimer(activeEntryId).catch(() => undefined);
    }

    logout();

    if (isDesktopApp()) {
      hardRedirectToLogin();
      return;
    }

    navigate('/login', { replace: true, state: { message: 'Signed out successfully.' } });
    setIsLoggingOut(false);
  };

  useEffect(() => {
    notificationService.list().then((res) => setNotifications(res.data ?? [])).catch(() => setNotifications([]));
  }, []);

  return (
    <div className="flex min-h-screen bg-background p-4 gap-4 text-white">
      {/* Sidebar */}
      <motion.aside
        animate={{ width: isCollapsed ? 80 : 260 }}
        className="glass rounded-3xl flex flex-col relative z-20 drag-region"
      >
        <div className="p-6 flex items-center justify-between no-drag">
          <AnimatePresence mode="wait">
            {!isCollapsed && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex items-center gap-2"
              >
                <div className="w-8 h-8 rounded-lg bg-ai-gradient flex items-center justify-center shadow-ai">
                  <Sparkles className="w-5 h-5 text-white" />
                </div>
                <span className="text-xl font-bold gradient-text uppercase tracking-tighter">FlowTrack</span>
              </motion.div>
            )}
          </AnimatePresence>
          
          <button 
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors no-drag"
          >
            {isCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          </button>
        </div>

        <nav className="flex-1 px-4 space-y-2 mt-4 no-drag">
          {navItems.map((item) => (
            <SidebarItem key={item.path} {...item} isCollapsed={isCollapsed} />
          ))}
        </nav>

        <div className="p-4 mt-auto border-t border-white/5 pt-6 no-drag">
          <motion.button
            type="button"
            whileHover={{ x: 4 }}
            onClick={handleLogout}
            disabled={isLoggingOut}
            className="flex items-center gap-3 w-full px-4 py-3 rounded-2xl text-slate-400 hover:text-accent hover:bg-accent/10 transition-all border border-transparent hover:border-accent/20 disabled:opacity-50 cursor-pointer"
          >
            <LogOut className="w-5 h-5" />
            {!isCollapsed && <span className="font-medium">{isLoggingOut ? 'Signing out…' : 'Sign Out'}</span>}
          </motion.button>
        </div>
      </motion.aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col gap-4 overflow-hidden">
        {/* Header */}
        <header 
          className="glass h-20 px-8 rounded-3xl flex items-center justify-between relative z-30 drag-region"
        >
          <div className="flex items-center gap-4 text-slate-400">
            <h2 className="text-xl font-semibold text-white">
              {navItems.find(item => item.path === location.pathname)?.label || 'Dashboard'}
            </h2>
            <div className="h-4 w-px bg-white/10"></div>
            <span className="text-sm">Welcome back, {user?.first_name || 'Agent'}</span>
          </div>

          <div className="flex items-center gap-6 no-drag">
            <TimerWidget />
            <div className="flex items-center gap-4 relative">
              <button 
                onClick={() => setShowNotifications(!showNotifications)}
                className={`p-2.5 rounded-xl hover:bg-white/10 text-slate-400 relative group transition-all ${showNotifications ? 'bg-white/10 text-white' : ''}`}
              >
                <Bell size={20} />
                <span className="absolute top-2.5 right-2.5 w-2 h-2 bg-accent rounded-full border-2 border-[#12141C]"></span>
              </button>

              <AnimatePresence>
                {showNotifications && (
                  <>
                    <motion.div 
                      initial={{ opacity: 0 }} 
                      animate={{ opacity: 1 }} 
                      exit={{ opacity: 0 }}
                      className="fixed inset-0 z-[90] bg-black/40" 
                      onClick={() => setShowNotifications(false)} 
                    />
                    <motion.div
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.95 }}
                      className="fixed top-24 right-8 w-80 dropdown-panel p-4 z-[100] overflow-hidden"
                    >
                      <div className="flex items-center justify-between mb-4 px-2">
                        <h4 className="font-bold text-white">Notifications</h4>
                        <button
                          onClick={() => notificationService.markAllRead().then(() => notificationService.list().then((res) => setNotifications(res.data ?? [])))}
                          className="text-[10px] font-bold text-primary-400 uppercase tracking-widest hover:underline"
                        >
                          Mark all as read
                        </button>
                      </div>
                      <div className="space-y-2">
                        {notifications.map((n) => (
                          <div key={n.id} className={`p-3 rounded-2xl transition-colors cursor-pointer ${n.is_read ? 'hover:bg-white/5' : 'bg-primary-500/5 hover:bg-primary-500/10 border border-primary-500/10'}`}>
                            <div className="flex justify-between items-start mb-1">
                              <span className={`text-xs font-bold ${n.is_read ? 'text-slate-200' : 'text-primary-400'}`}>{n.title || 'Notification'}</span>
                              <span className="text-[10px] text-slate-500">{n.created_at ? new Date(n.created_at).toLocaleString() : ''}</span>
                            </div>
                            <p className="text-[11px] text-slate-400 leading-tight">{n.message || n.title || 'No details'}</p>
                          </div>
                        ))}
                        {notifications.length === 0 && (
                          <p className="text-xs text-slate-500 px-2 py-4">No notifications.</p>
                        )}
                      </div>
                      <button className="w-full mt-4 py-3 text-center text-xs font-bold text-slate-500 hover:text-white bg-white/5 rounded-xl transition-all"
                        onClick={() => { setShowNotifications(false); navigate('/activity'); }}
                      >
                        View All Activity
                      </button>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>

              <div 
                className="w-10 h-10 rounded-xl bg-surface-200 border border-white/10 flex items-center justify-center text-primary-400 font-bold uppercase transition-transform hover:scale-110 cursor-pointer"
                title={`${user?.first_name} ${user?.last_name}`}
              >
                {user?.first_name?.[0]}{user?.last_name?.[0]}
              </div>

              {isDesktopApp() && (
                <>
                  <div className="h-8 w-px bg-white/10 mx-1" />
                  <WindowControls />
                </>
              )}
            </div>
          </div>
        </header>

        {/* Page Content */}
        <div className="flex-1 glass rounded-3xl p-8 overflow-y-auto">
          {children}
        </div>
      </main>
    </div>
  );
};
