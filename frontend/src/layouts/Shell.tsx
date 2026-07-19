import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LogOut,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Bell,
  Settings,
  Shield,
  ShieldAlert,
  Menu,
  X,
  Search,
  Keyboard,
} from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { TimerWidget } from '../components/TimerWidget';
import { notificationService } from '../api/notificationService';
import { useTimerStore } from '../store/timerStore';
import { timeService } from '../api/timeService';
import { getNavGroupsForUser, getNavItemsForUser, isSuperAdmin, canViewOrgPackage } from '../utils/access';
import { hardRedirectToLogin, isDesktopApp } from '../utils/electronAuth';
import { isDesktopForeground } from '../utils/desktopLifecycle';
import { Avatar } from '../components/ui/Avatar';
import { ThemeToggleButton } from '../components/ThemeToggle';
import { useUiChromeStore } from '../store/uiChromeStore';
import { cn } from '../lib/cn';

const SidebarItem = ({
  icon: Icon,
  label,
  path,
  isCollapsed,
  onNavigate,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  path: string;
  isCollapsed: boolean;
  onNavigate?: () => void;
}) => {
  const location = useLocation();
  const isActive =
    location.pathname === path ||
    (path !== '/app' && path !== '/time' && location.pathname.startsWith(`${path}/`));

  return (
    <Link to={path} onClick={onNavigate}>
      <motion.div
        whileHover={{ x: 4 }}
        className={cn(
          'flex items-center gap-3 px-4 py-3 rounded-2xl transition-all duration-300 group',
          isActive
            ? 'bg-primary-500/10 text-primary-400 border border-primary-500/20 shadow-ai'
            : 'text-slate-400 hover:text-white hover:bg-white/5',
        )}
      >
        <Icon className={cn('w-5 h-5 transition-colors', isActive ? 'text-primary-400' : 'group-hover:text-primary-400')} />
        {!isCollapsed && <span className="font-medium whitespace-nowrap">{label}</span>}
      </motion.div>
    </Link>
  );
};

function SidebarContent({
  isCollapsed,
  onNavigate,
}: {
  isCollapsed: boolean;
  onNavigate?: () => void;
}) {
  const user = useAuthStore((s) => s.user);
  const navGroups = getNavGroupsForUser(user);

  return (
    <>
      <div className="p-6 flex items-center justify-between no-drag">
        <AnimatePresence mode="wait">
          {!isCollapsed && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-2"
            >
              <div className="w-8 h-8 rounded-lg bg-ai-gradient flex items-center justify-center shadow-ai keep-on-color">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <span className="text-xl font-bold gradient-text uppercase tracking-tighter">FlowTrack</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <nav className="flex-1 px-4 space-y-5 mt-2 no-drag overflow-y-auto pb-4">
        {navGroups.map((group) => (
          <div key={group.id} className="space-y-1">
            {!isCollapsed && (
              <div className="px-4 pt-1 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                {group.label}
              </div>
            )}
            {group.items.map((item) => (
              <SidebarItem key={item.path} {...item} isCollapsed={isCollapsed} onNavigate={onNavigate} />
            ))}
          </div>
        ))}
      </nav>
    </>
  );
}

export const Shell = ({ children }: { children: React.ReactNode }) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const location = useLocation();
  const resetLocal = useTimerStore((s) => s.resetLocal);
  const [notifications, setNotifications] = useState<Record<string, unknown>[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const navItems = getNavItemsForUser(user);
  const mobileNavOpen = useUiChromeStore((s) => s.mobileNavOpen);
  const setMobileNavOpen = useUiChromeStore((s) => s.setMobileNavOpen);
  const setCommandPaletteOpen = useUiChromeStore((s) => s.setCommandPaletteOpen);
  const setShortcutsHelpOpen = useUiChromeStore((s) => s.setShortcutsHelpOpen);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname, setMobileNavOpen]);

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
    let interval: ReturnType<typeof setInterval> | null = null;
    let stream: EventSource | null = null;

    const loadNotifications = () => {
      if (!isDesktopForeground()) return;
      notificationService.list().then((res) => setNotifications(res.data ?? [])).catch(() => setNotifications([]));
    };
    const loadUnread = () => {
      if (!isDesktopForeground()) return;
      notificationService.unreadCount()
        .then((res) => setUnreadCount(Number(res.data?.count ?? res.count ?? 0)))
        .catch(() => setUnreadCount(0));
    };

    const stopStream = () => {
      if (stream) {
        stream.close();
        stream = null;
      }
    };

    const startStream = () => {
      if (!isDesktopForeground()) return;
      stopStream();
      stream = notificationService.openStream({
        onNotification: (n) => {
          setNotifications((prev) => [n, ...prev].slice(0, 50));
          setUnreadCount((c) => c + 1);
        },
        onUnread: (count) => setUnreadCount(count),
      });
    };

    const stopPolling = () => {
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
    };

    const startPolling = () => {
      if (!isDesktopForeground()) return;
      stopPolling();
      loadNotifications();
      loadUnread();
      startStream();
      interval = setInterval(loadUnread, 60000);
    };

    startPolling();

    const onBackground = () => { stopPolling(); stopStream(); };
    const onForeground = () => startPolling();
    const onShutdown = () => { stopPolling(); stopStream(); };

    window.addEventListener('flowtrack-app-background', onBackground);
    window.addEventListener('flowtrack-app-foreground', onForeground);
    window.addEventListener('flowtrack-app-shutdown', onShutdown);

    return () => {
      stopPolling();
      stopStream();
      window.removeEventListener('flowtrack-app-background', onBackground);
      window.removeEventListener('flowtrack-app-foreground', onForeground);
      window.removeEventListener('flowtrack-app-shutdown', onShutdown);
    };
  }, []);

  const pageTitle =
    navItems.find((item) => item.path === location.pathname)?.label
    || (location.pathname.startsWith('/integrations') ? 'Integrations' : null)
    || (location.pathname.startsWith('/invoices/') ? 'Invoice Detail' : null)
    || (location.pathname === '/timesheets' ? 'Timesheets' : null)
    || (location.pathname === '/settings' ? 'Settings' : null)
    || (location.pathname === '/admin' ? 'Platform Admin' : null)
    || (location.pathname === '/activity-feed' ? 'Activity Feed' : null)
    || (location.pathname === '/onboarding' ? 'Getting Started' : null)
    || 'Dashboard';

  return (
    <div className={cn('flex min-h-screen w-full max-w-full overflow-x-hidden bg-background gap-4 text-white p-2 sm:p-4', isDesktopApp() ? 'pt-10' : '')}>
      {/* Desktop sidebar */}
      <motion.aside
        animate={{ width: isCollapsed ? 80 : 260 }}
        className="glass rounded-3xl flex-col relative z-20 drag-region hidden lg:flex shrink-0 overflow-hidden"
      >
        <div className="absolute top-6 right-3 z-10 no-drag">
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
          >
            {isCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          </button>
        </div>
        <SidebarContent isCollapsed={isCollapsed} />
      </motion.aside>

      {/* Mobile drawer */}
      <AnimatePresence>
        {mobileNavOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[180] bg-black/70 lg:hidden"
              onClick={() => setMobileNavOpen(false)}
            />
            <motion.aside
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: 'spring', stiffness: 320, damping: 32 }}
              className="fixed left-2 top-2 bottom-2 w-[260px] z-[190] glass rounded-3xl flex flex-col lg:hidden"
            >
              <button
                type="button"
                className="absolute top-4 right-4 p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/10"
                onClick={() => setMobileNavOpen(false)}
                aria-label="Close menu"
              >
                <X size={18} />
              </button>
              <SidebarContent isCollapsed={false} onNavigate={() => setMobileNavOpen(false)} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <main className="flex-1 flex flex-col gap-3 sm:gap-4 overflow-hidden min-w-0 max-w-full">
        <header className="glass h-16 sm:h-20 px-3 sm:px-6 lg:px-8 rounded-2xl sm:rounded-3xl flex items-center justify-between relative z-30 drag-region gap-2 min-w-0">
          <div className="flex items-center gap-2 sm:gap-4 text-slate-400 min-w-0 overflow-hidden">
            <button
              type="button"
              className="lg:hidden p-2 rounded-xl hover:bg-white/10 text-slate-300 no-drag"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Open menu"
            >
              <Menu size={20} />
            </button>
            <h2 className="text-base sm:text-xl font-semibold text-white truncate">{pageTitle}</h2>
            {canViewOrgPackage(user) && user?.plan && (
              <span className="hidden md:inline text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-primary-500/10 text-primary-400 border border-primary-500/20">
                {user.plan.name}
              </span>
            )}
            <div className="h-4 w-px bg-white/10 hidden sm:block" />
            <span className="text-sm hidden md:inline">Welcome back, {user?.first_name || 'Agent'}</span>
          </div>

          <div className="flex items-center gap-2 sm:gap-4 no-drag shrink-0">
            <div className="hidden xl:block">
              <TimerWidget />
            </div>

            <button
              type="button"
              onClick={() => setCommandPaletteOpen(true)}
              className="hidden sm:inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-slate-400 hover:text-white text-xs"
              title="Command palette (Ctrl/Cmd+K)"
            >
              <Search size={14} />
              <span className="hidden lg:inline">Search</span>
              <kbd className="text-[10px] border border-white/10 rounded px-1">⌘K</kbd>
            </button>

            <button
              type="button"
              onClick={() => setShortcutsHelpOpen(true)}
              className="hidden md:inline-flex p-2.5 rounded-xl hover:bg-white/10 text-slate-400"
              title="Keyboard shortcuts (?)"
            >
              <Keyboard size={18} />
            </button>

            <ThemeToggleButton />

            <div className="flex items-center gap-2 sm:gap-4 relative">
              <button
                onClick={() => {
                  setShowNotifications(!showNotifications);
                  setShowUserMenu(false);
                }}
                className={cn(
                  'p-2.5 rounded-xl hover:bg-white/10 text-slate-400 relative group transition-all',
                  showNotifications && 'bg-white/10 text-white',
                )}
              >
                <Bell size={20} />
                {unreadCount > 0 && (
                  <span className="absolute top-1.5 right-1.5 min-w-[18px] h-[18px] px-1 bg-accent rounded-full border-2 border-[#12141C] text-[10px] font-bold text-white keep-on-color flex items-center justify-center">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
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
                      className="fixed top-20 sm:top-24 right-2 sm:right-8 w-80 max-w-[calc(100%-1rem)] dropdown-panel p-4 z-[100] overflow-hidden"
                    >
                      <div className="flex items-center justify-between mb-4 px-2">
                        <h4 className="font-bold text-white">Notifications</h4>
                        <button
                          onClick={() => notificationService.markAllRead().then(() => {
                            notificationService.list().then((res) => setNotifications(res.data ?? []));
                            setUnreadCount(0);
                          })}
                          className="text-[10px] font-bold text-primary-400 uppercase tracking-widest hover:underline"
                        >
                          Mark all as read
                        </button>
                      </div>
                      <div className="space-y-2 max-h-72 overflow-y-auto">
                        {notifications.map((n) => (
                          <div key={String(n.id)} className={`p-3 rounded-2xl transition-colors cursor-pointer ${n.is_read ? 'hover:bg-white/5' : 'bg-primary-500/5 hover:bg-primary-500/10 border border-primary-500/10'}`}>
                            <div className="flex justify-between items-start mb-1">
                              <span className={`text-xs font-bold ${n.is_read ? 'text-slate-200' : 'text-primary-400'}`}>{String(n.title || 'Notification')}</span>
                              <span className="text-[10px] text-slate-500">{n.created_at ? new Date(String(n.created_at)).toLocaleString() : ''}</span>
                            </div>
                            <p className="text-[11px] text-slate-400 leading-tight">{String(n.message || n.title || 'No details')}</p>
                          </div>
                        ))}
                        {notifications.length === 0 && (
                          <p className="text-xs text-slate-500 px-2 py-4">No notifications.</p>
                        )}
                      </div>
                      <button
                        className="w-full mt-4 py-3 text-center text-xs font-bold text-slate-500 hover:text-white bg-white/5 rounded-xl transition-all"
                        onClick={() => { setShowNotifications(false); navigate('/activity-feed'); }}
                      >
                        Open Activity Feed
                      </button>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>

              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setShowUserMenu((v) => !v);
                    setShowNotifications(false);
                  }}
                  className="transition-transform hover:scale-110 cursor-pointer"
                  title={`${user?.first_name} ${user?.last_name}`}
                >
                  <Avatar name={`${user?.first_name ?? ''} ${user?.last_name ?? ''}`} size="md" className="rounded-xl" />
                </button>

                <AnimatePresence>
                  {showUserMenu && (
                    <>
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[90]"
                        onClick={() => setShowUserMenu(false)}
                      />
                      <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                        className="fixed top-20 sm:top-24 right-2 sm:right-8 w-56 dropdown-panel p-2 z-[100]"
                      >
                        <div className="px-3 py-2 border-b border-white/10 mb-1">
                          <p className="text-sm font-semibold text-white truncate">{user?.first_name} {user?.last_name}</p>
                          <p className="text-xs text-slate-500 truncate">{user?.email}</p>
                        </div>

                        <button
                          type="button"
                          onClick={() => { setShowUserMenu(false); navigate('/settings'); }}
                          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-slate-300 hover:text-white hover:bg-white/5 transition-colors text-sm"
                        >
                          <Settings size={16} />
                          Settings
                        </button>

                        <button
                          type="button"
                          onClick={() => { setShowUserMenu(false); navigate('/onboarding'); }}
                          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-slate-300 hover:text-white hover:bg-white/5 transition-colors text-sm"
                        >
                          <Sparkles size={16} />
                          Getting Started
                        </button>

                        {isSuperAdmin(user) && (
                          <button
                            type="button"
                            onClick={() => { setShowUserMenu(false); navigate('/admin'); }}
                            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-slate-300 hover:text-white hover:bg-white/5 transition-colors text-sm"
                          >
                            <Shield size={16} />
                            Platform Admin
                          </button>
                        )}

                        <div className="my-1 border-t border-white/10" />

                        <button
                          type="button"
                          onClick={() => { setShowUserMenu(false); handleLogout(); }}
                          disabled={isLoggingOut}
                          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-slate-400 hover:text-accent hover:bg-accent/10 transition-colors text-sm disabled:opacity-50"
                        >
                          <LogOut size={16} />
                          {isLoggingOut ? 'Signing out…' : 'Sign Out'}
                        </button>
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>
        </header>

        {/* Mobile timer bar */}
        <div className="xl:hidden px-1">
          <TimerWidget />
        </div>

        <div className="flex-1 glass rounded-2xl sm:rounded-3xl p-4 sm:p-6 lg:p-8 overflow-y-auto overflow-x-hidden min-w-0">
          {user?.advanced_monitoring?.active && (
            <div className="mb-6 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-5 py-4 flex items-start gap-3">
              <ShieldAlert className="text-rose-400 shrink-0 mt-0.5" size={20} />
              <div>
                <p className="font-semibold text-rose-100">Advanced monitoring is active on your account</p>
                <p className="text-sm text-rose-200/80 mt-1">
                  Your organization has intensified activity and screenshot monitoring
                  {user.advanced_monitoring.started_at ? ` since ${new Date(user.advanced_monitoring.started_at).toLocaleString()}` : ''}.
                  {user.advanced_monitoring.reason ? ` Note: ${user.advanced_monitoring.reason}` : ''}
                </p>
              </div>
            </div>
          )}
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18 }}
          >
            {children}
          </motion.div>
        </div>
      </main>
    </div>
  );
};
