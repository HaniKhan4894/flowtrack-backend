import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Activity,
  ArrowLeft,
  Building2,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Gauge,
  HeartPulse,
  Layers,
  LogOut,
  Megaphone,
  Menu,
  Radar,
  Receipt,
  ScrollText,
  Send,
  ShieldCheck,
  Ticket,
  TrendingUp,
  Users,
  X,
} from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { Avatar } from '../components/ui/Avatar';
import { ThemeToggleButton } from '../components/ThemeToggle';
import { isDesktopApp, hardRedirectToLogin } from '../utils/electronAuth';
import { cn } from '../lib/cn';

interface AdminNavItem {
  icon: React.ComponentType<{ className?: string; size?: number }>;
  label: string;
  path: string;
  description: string;
}

interface AdminNavGroup {
  id: string;
  label: string;
  items: AdminNavItem[];
}

const ADMIN_NAV_GROUPS: AdminNavGroup[] = [
  {
    id: 'insight',
    label: 'Insight',
    items: [
      { icon: Gauge, label: 'Overview', path: '/admin', description: 'Platform KPIs, growth, and churn' },
      { icon: Radar, label: 'Usage', path: '/admin/usage', description: 'Adoption and consumption analytics' },
    ],
  },
  {
    id: 'tenants',
    label: 'Tenants',
    items: [
      { icon: Building2, label: 'Organizations', path: '/admin/organizations', description: 'Every tenant on the platform' },
      { icon: Users, label: 'Users', path: '/admin/users', description: 'Global user directory' },
    ],
  },
  {
    id: 'revenue',
    label: 'Revenue',
    items: [
      { icon: CreditCard, label: 'Subscriptions', path: '/admin/subscriptions', description: 'Billing status and revenue' },
      { icon: Receipt, label: 'Payments', path: '/admin/payments', description: 'Invoice ledger, refunds, and dunning' },
      { icon: Layers, label: 'Plans & Features', path: '/admin/plans', description: 'Pricing catalogue and feature flags' },
    ],
  },
  {
    id: 'growth',
    label: 'Growth',
    items: [
      { icon: TrendingUp, label: 'Growth', path: '/admin/growth', description: 'Funnel, cohorts, churn, and account health' },
      { icon: Send, label: 'Campaigns', path: '/admin/campaigns', description: 'Lifecycle email and win-back automation' },
      { icon: Ticket, label: 'Coupons', path: '/admin/coupons', description: 'Discount codes and offers' },
    ],
  },
  {
    id: 'operations',
    label: 'Operations',
    items: [
      { icon: Megaphone, label: 'Announcements', path: '/admin/announcements', description: 'Broadcast to tenants' },
      { icon: ScrollText, label: 'Audit Log', path: '/admin/audit', description: 'Platform and tenant activity trail' },
      { icon: HeartPulse, label: 'System Health', path: '/admin/health', description: 'Infrastructure and settings' },
    ],
  },
];

const AdminSidebarItem = ({
  item,
  isCollapsed,
  onNavigate,
}: {
  item: AdminNavItem;
  isCollapsed: boolean;
  onNavigate?: () => void;
}) => {
  const location = useLocation();
  const isActive =
    location.pathname === item.path ||
    (item.path !== '/admin' && location.pathname.startsWith(`${item.path}/`));

  return (
    <Link to={item.path} onClick={onNavigate} title={isCollapsed ? item.label : undefined}>
      <motion.div
        whileHover={{ x: 4 }}
        className={cn(
          'flex items-center gap-3 px-4 py-3 rounded-2xl transition-all duration-300 group',
          isActive
            ? 'bg-amber-500/10 text-amber-300 border border-amber-500/25'
            : 'text-slate-400 hover:text-white hover:bg-white/5 border border-transparent',
        )}
      >
        <item.icon className={cn('w-5 h-5 shrink-0 transition-colors', isActive ? 'text-amber-300' : 'group-hover:text-amber-300')} />
        {!isCollapsed && <span className="font-medium whitespace-nowrap">{item.label}</span>}
      </motion.div>
    </Link>
  );
};

function AdminSidebarContent({ isCollapsed, onNavigate }: { isCollapsed: boolean; onNavigate?: () => void }) {
  return (
    <>
      <div className="p-6 pb-4">
        {isCollapsed ? (
          <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/25 flex items-center justify-center">
            <ShieldCheck className="w-5 h-5 text-amber-300" />
          </div>
        ) : (
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/25 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5 text-amber-300" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-white leading-tight truncate">FlowTrack</p>
              <p className="text-[10px] font-bold uppercase tracking-widest text-amber-300/80">Platform Admin</p>
            </div>
          </div>
        )}
      </div>

      <nav className="flex-1 px-4 space-y-5 no-drag overflow-y-auto pb-4">
        {ADMIN_NAV_GROUPS.map((group) => (
          <div key={group.id} className="space-y-1">
            {!isCollapsed && (
              <div className="px-4 pt-1 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                {group.label}
              </div>
            )}
            {group.items.map((item) => (
              <AdminSidebarItem key={item.path} item={item} isCollapsed={isCollapsed} onNavigate={onNavigate} />
            ))}
          </div>
        ))}
      </nav>

      <div className="px-4 pb-5">
        <Link
          to="/app"
          onClick={onNavigate}
          className={cn(
            'flex items-center gap-3 px-4 py-3 rounded-2xl text-slate-400 hover:text-white hover:bg-white/5 transition-colors',
            isCollapsed && 'justify-center px-0',
          )}
          title="Back to workspace"
        >
          <ArrowLeft className="w-5 h-5 shrink-0" />
          {!isCollapsed && <span className="font-medium text-sm">Back to workspace</span>}
        </Link>
      </div>
    </>
  );
}

function currentPageMeta(pathname: string): { title: string; description: string } {
  const all = ADMIN_NAV_GROUPS.flatMap((g) => g.items);
  const exact = all.find((item) => item.path === pathname);
  if (exact) return { title: exact.label, description: exact.description };

  if (pathname.startsWith('/admin/organizations/')) {
    return { title: 'Organization Detail', description: 'Tenant profile, usage, and billing' };
  }
  if (pathname.startsWith('/admin/users/')) {
    return { title: 'User Detail', description: 'Account profile, sessions, and support tools' };
  }
  if (pathname.startsWith('/admin/campaigns/')) {
    return { title: 'Campaign Detail', description: 'Delivery, engagement, and revenue attribution' };
  }

  return { title: 'Platform Admin', description: 'Super-admin control centre' };
}

export const AdminShell = ({ children }: { children: React.ReactNode }) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const location = useLocation();
  const meta = currentPageMeta(location.pathname);

  const handleLogout = async () => {
    await logout();
    if (isDesktopApp()) {
      hardRedirectToLogin();
      return;
    }
    navigate('/login', { replace: true });
  };

  return (
    <div className={cn('flex min-h-screen w-full max-w-full overflow-x-hidden bg-background gap-4 text-white p-2 sm:p-4', isDesktopApp() ? 'pt-10' : '')}>
      <motion.aside
        animate={{ width: isCollapsed ? 88 : 264 }}
        className="glass rounded-3xl flex-col relative z-20 hidden lg:flex shrink-0 overflow-hidden border border-amber-500/10"
      >
        <div className="absolute top-6 right-3 z-10">
          <button
            type="button"
            onClick={() => setIsCollapsed((v) => !v)}
            className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
            aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {isCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          </button>
        </div>
        <AdminSidebarContent isCollapsed={isCollapsed} />
      </motion.aside>

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
              className="fixed left-2 top-2 bottom-2 w-[264px] z-[190] glass rounded-3xl flex flex-col lg:hidden border border-amber-500/10"
            >
              <button
                type="button"
                className="absolute top-4 right-4 p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/10"
                onClick={() => setMobileNavOpen(false)}
                aria-label="Close menu"
              >
                <X size={18} />
              </button>
              <AdminSidebarContent isCollapsed={false} onNavigate={() => setMobileNavOpen(false)} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <main className="flex-1 flex flex-col gap-3 sm:gap-4 overflow-hidden min-w-0 max-w-full">
        <header className="glass h-16 sm:h-20 px-3 sm:px-6 rounded-2xl sm:rounded-3xl flex items-center justify-between relative z-30 gap-2 min-w-0 border border-amber-500/10">
          <div className="flex items-center gap-3 min-w-0 overflow-hidden">
            <button
              type="button"
              className="lg:hidden p-2 rounded-xl hover:bg-white/10 text-slate-300"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Open menu"
            >
              <Menu size={20} />
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-xl font-semibold text-white truncate">{meta.title}</h1>
                <span className="hidden md:inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/25">
                  <ShieldCheck size={11} />
                  Super Admin
                </span>
              </div>
              <p className="hidden sm:block text-xs text-slate-400 truncate">{meta.description}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <Link
              to="/app"
              className="hidden sm:inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-slate-300 hover:text-white text-xs font-medium transition-colors"
            >
              <Activity size={14} />
              Workspace
            </Link>
            <ThemeToggleButton />
            <div className="hidden sm:flex items-center gap-2.5 pl-2 border-l border-white/10">
              <Avatar name={`${user?.first_name ?? ''} ${user?.last_name ?? ''}`} size="sm" className="rounded-lg" />
              <div className="hidden xl:block min-w-0">
                <p className="text-xs font-semibold text-white truncate max-w-[140px]">{user?.first_name} {user?.last_name}</p>
                <p className="text-[10px] text-slate-500 truncate max-w-[140px]">{user?.email}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="p-2.5 rounded-xl text-slate-400 hover:text-rose-300 hover:bg-rose-500/10 transition-colors"
              title="Sign out"
            >
              <LogOut size={18} />
            </button>
          </div>
        </header>

        <div className="flex-1 glass rounded-2xl sm:rounded-3xl p-4 sm:p-6 lg:p-8 overflow-y-auto overflow-x-hidden min-w-0">
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
