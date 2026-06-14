import type { User } from '../types';
import {
  LayoutDashboard,
  Clock,
  Briefcase,
  Users,
  CreditCard,
  Settings,
  Sparkles,
  Camera,
  Activity,
  FileText,
  Wallet,
  Shield,
  Building2,
  CalendarDays,
  ClipboardList,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  icon: LucideIcon;
  label: string;
  path: string;
  permission?: string;
  showIf?: (user: User | null | undefined) => boolean;
}

const ALL_NAV_ITEMS: NavItem[] = [
  { icon: LayoutDashboard, label: 'Dashboard', path: '/app' },
  { icon: Clock, label: 'Time Tracking', path: '/time', permission: 'time.view_own' },
  { icon: ClipboardList, label: 'Timesheets', path: '/timesheets', permission: 'timesheet.submit' },
  { icon: Briefcase, label: 'Projects', path: '/projects', permission: 'projects.view' },
  { icon: Building2, label: 'Clients', path: '/clients', permission: 'invoices.view' },
  { icon: CalendarDays, label: 'Leave', path: '/leave' },
  { icon: Camera, label: 'Screenshots', path: '/screenshots', permission: 'screenshots.view_own' },
  { icon: Activity, label: 'Activity', path: '/activity', permission: 'activity.view_own' },
  { icon: FileText, label: 'Invoices', path: '/invoices', permission: 'invoices.view' },
  { icon: Wallet, label: 'Payroll', path: '/payroll', permission: 'payroll.view' },
  {
    icon: Users,
    label: 'Team',
    path: '/team',
    showIf: (user) => canViewTeam(user),
  },
  { icon: Sparkles, label: 'Analytics', path: '/analytics', permission: 'reports.view_own' },
  { icon: CreditCard, label: 'Billing', path: '/billing', permission: 'settings.billing' },
];

export const SETTINGS_NAV_ITEM: NavItem = { icon: Settings, label: 'Settings', path: '/settings', permission: 'settings.view' };
export const ADMIN_NAV_ITEM: NavItem = { icon: Shield, label: 'Platform Admin', path: '/admin' };

const PATH_PERMISSIONS: Record<string, string | string[]> = {
  '/app': [],
  '/time': 'time.view_own',
  '/timesheets': 'timesheet.submit',
  '/projects': 'projects.view',
  '/clients': 'invoices.view',
  '/leave': [],
  '/screenshots': 'screenshots.view_own',
  '/activity': 'activity.view_own',
  '/invoices': 'invoices.view',
  '/payroll': 'payroll.view',
  '/team': '__team_nav__',
  '/analytics': ['reports.view_own', 'reports.view_team'],
  '/billing': 'settings.billing',
  '/settings': [],
  '/admin': '__super_admin__',
  '/team/member': ['time.view_team', 'screenshots.view_team', 'activity.view_team'],
};

export function isOrgAdmin(user: User | null | undefined): boolean {
  if (!user) return false;
  if (user.is_org_admin) return true;
  const role = user.organization_role ?? user.role;
  return role === 'owner' || role === 'admin' || role === 'manager';
}

export function isTeamLead(user: User | null | undefined): boolean {
  if (!user) return false;
  if (user.is_team_lead) return true;
  const role = user.organization_role ?? user.role;
  return role === 'team_lead';
}

export function canViewTeam(user: User | null | undefined): boolean {
  if (!user) return false;
  if (hasPermission(user, 'users.view')) return true;
  return !!user.can_view_team;
}

export function isSuperAdmin(user: User | null | undefined): boolean {
  return !!user?.is_super_admin;
}

export function hasPermission(user: User | null | undefined, slug: string): boolean {
  if (!user?.permissions?.length) return false;
  return user.permissions.includes(slug);
}

export function hasAnyPermission(user: User | null | undefined, slugs: string[]): boolean {
  return slugs.some((slug) => hasPermission(user, slug));
}

export function canAccessPath(user: User | null | undefined, path: string): boolean {
  if (!user) return false;

  if (path.startsWith('/admin')) {
    return isSuperAdmin(user);
  }

  if (path.startsWith('/team/member')) {
    return hasAnyPermission(user, ['time.view_team', 'screenshots.view_team', 'activity.view_team', 'reports.view_team']);
  }

  const rule = PATH_PERMISSIONS[path];
  if (!rule) return true;
  if (Array.isArray(rule)) {
    if (rule.length === 0) return true;
    return hasAnyPermission(user, rule);
  }
  if (rule === '__super_admin__') return isSuperAdmin(user);
  if (rule === '__team_nav__') return canViewTeam(user);
  return hasPermission(user, rule);
}

export function getNavItemsForUser(user: User | null | undefined): NavItem[] {
  return ALL_NAV_ITEMS.filter((item) => {
    if (item.showIf) return item.showIf(user);
    if (!item.permission) return true;
    return hasPermission(user, item.permission);
  });
}

export function canAccessSettings(_user: User | null | undefined): boolean {
  return !!_user;
}

export function canManageTeam(user: User | null | undefined): boolean {
  return hasPermission(user, 'users.create') || hasPermission(user, 'users.edit');
}

export function canViewMemberTracking(user: User | null | undefined): boolean {
  return hasAnyPermission(user, ['time.view_team', 'screenshots.view_team', 'activity.view_team', 'reports.view_team']);
}
