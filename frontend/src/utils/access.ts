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
  Brain,
  Building2,
  CalendarDays,
  ClipboardList,
  MessageSquare,
  HeartPulse,
  FileCheck,
  Plug,
  Rss,
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
  {
    icon: Briefcase,
    label: 'Projects',
    path: '/projects',
    showIf: (user) => canManageProjects(user),
  },
  { icon: Building2, label: 'Clients', path: '/clients', permission: 'invoices.view' },
  { icon: CalendarDays, label: 'Leave', path: '/leave' },
  {
    icon: Camera,
    label: 'Screenshots',
    path: '/screenshots',
    showIf: (user) => canAccessScreenshotsPage(user),
  },
  { icon: Activity, label: 'Activity', path: '/activity', permission: 'activity.view_own' },
  { icon: Rss, label: 'Activity Feed', path: '/activity-feed' },
  { icon: FileText, label: 'Invoices', path: '/invoices', permission: 'invoices.view' },
  { icon: Wallet, label: 'Payroll', path: '/payroll', permission: 'payroll.view' },
  {
    icon: Users,
    label: 'Team',
    path: '/team',
    showIf: (user) => canViewTeam(user),
  },
  { icon: Sparkles, label: 'Analytics', path: '/analytics', permission: 'reports.view_own' },
  { icon: Brain, label: 'Insights', path: '/insights', permission: 'reports.view_own' },
  { icon: MessageSquare, label: 'Standup', path: '/standup', permission: 'reports.view_own' },
  { icon: HeartPulse, label: 'Wellbeing', path: '/wellbeing', permission: 'reports.view_own' },
  {
    icon: FileCheck,
    label: 'Proof of Work',
    path: '/proof-of-work',
    showIf: (user) => canViewTeam(user),
  },
  { icon: CreditCard, label: 'Billing', path: '/billing', permission: 'settings.billing' },
  { icon: Plug, label: 'Integrations', path: '/integrations', showIf: (user) => canManageIntegrations(user) },
];

export const SETTINGS_NAV_ITEM: NavItem = { icon: Settings, label: 'Settings', path: '/settings', permission: 'settings.view' };
export const ADMIN_NAV_ITEM: NavItem = { icon: Shield, label: 'Platform Admin', path: '/admin' };

const PATH_PERMISSIONS: Record<string, string | string[]> = {
  '/app': [],
  '/time': 'time.view_own',
  '/timesheets': 'timesheet.submit',
  '/projects': ['projects.create', 'projects.edit'],
  '/clients': 'invoices.view',
  '/leave': [],
  '/screenshots': '__screenshots__',
  '/activity': 'activity.view_own',
  '/invoices': 'invoices.view',
  '/payroll': 'payroll.view',
  '/team': '__team_nav__',
  '/analytics': ['reports.view_own', 'reports.view_team'],
  '/insights': ['reports.view_own', 'reports.view_team'],
  '/standup': ['reports.view_own', 'reports.view_team'],
  '/wellbeing': ['reports.view_own', 'reports.view_team'],
  '/proof-of-work': 'reports.view_team',
  '/billing': 'settings.billing',
  '/integrations': '__integrations__',
  '/integrations/jira': [],
  '/integrations/github': [],
  '/integrations/slack': [],
  '/activity-feed': [],
  '/onboarding': [],
  '/settings': [],
  '/admin': '__super_admin__',
  '/team/member': ['time.view_team', 'screenshots.view_team', 'activity.view_team'],
};

export function canManageIntegrations(user: User | null | undefined): boolean {
  if (!user) return false;
  if (isOrgAdmin(user)) return true;
  return hasPermission(user, 'settings.edit');
}

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
  if (rule === '__screenshots__') return canAccessScreenshotsPage(user);
  if (rule === '__integrations__') return canManageIntegrations(user);
  return hasPermission(user, rule);
}

export function getNavItemsForUser(user: User | null | undefined): NavItem[] {
  return ALL_NAV_ITEMS.filter((item) => {
    if (item.showIf) return item.showIf(user);
    if (!item.permission) return true;
    return hasPermission(user, item.permission);
  });
}

export function canViewOrgPackage(user: User | null | undefined): boolean {
  if (!user) return false;
  const role = (user.organization_role ?? user.role ?? '').toLowerCase();
  return role === 'owner' || role === 'admin';
}

export function canAccessSettings(_user: User | null | undefined): boolean {
  return !!_user;
}

export function canManageProjects(user: User | null | undefined): boolean {
  return hasAnyPermission(user, ['projects.create', 'projects.edit']);
}

export function canManageTeam(user: User | null | undefined): boolean {
  return hasPermission(user, 'users.create') || hasPermission(user, 'users.edit');
}

export function canViewMemberTracking(user: User | null | undefined): boolean {
  return hasAnyPermission(user, ['time.view_team', 'screenshots.view_team', 'activity.view_team', 'reports.view_team']);
}

/** Org setting: members cannot view their own screenshots (managers/admins exempt). */
export function areOwnScreenshotsHidden(user: User | null | undefined): boolean {
  if (!user?.tracking_config?.screenshot_hide_from_users) return false;
  return !hasPermission(user, 'screenshots.view_team');
}

export function canAccessScreenshotsPage(user: User | null | undefined): boolean {
  if (!user) return false;
  if (hasPermission(user, 'screenshots.view_team')) {
    return hasAnyPermission(user, ['screenshots.view_team', 'screenshots.view_own']);
  }
  if (areOwnScreenshotsHidden(user)) return false;
  return hasPermission(user, 'screenshots.view_own');
}

/** Owner, admin, and manager only — used for unusual activity and org-wide oversight. */
export function canViewUnusualActivity(user: User | null | undefined): boolean {
  return isOrgAdmin(user);
}
