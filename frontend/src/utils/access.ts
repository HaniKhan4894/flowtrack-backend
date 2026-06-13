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
  Shield,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  icon: LucideIcon;
  label: string;
  path: string;
  permission?: string;
}

const ALL_NAV_ITEMS: NavItem[] = [
  { icon: LayoutDashboard, label: 'Dashboard', path: '/app' },
  { icon: Clock, label: 'Time Tracking', path: '/time', permission: 'time.view_own' },
  { icon: Briefcase, label: 'Projects', path: '/projects', permission: 'projects.view' },
  { icon: Camera, label: 'Screenshots', path: '/screenshots', permission: 'screenshots.view_own' },
  { icon: Activity, label: 'Activity', path: '/activity', permission: 'activity.view_own' },
  { icon: FileText, label: 'Invoices', path: '/invoices', permission: 'invoices.view' },
  { icon: Users, label: 'Team', path: '/team', permission: 'users.view' },
  { icon: Sparkles, label: 'Analytics', path: '/analytics', permission: 'reports.view_own' },
  { icon: CreditCard, label: 'Billing', path: '/billing', permission: 'settings.billing' },
  { icon: Settings, label: 'Settings', path: '/settings', permission: 'settings.view' },
];

const ADMIN_NAV_ITEM: NavItem = { icon: Shield, label: 'Platform Admin', path: '/admin' };

const PATH_PERMISSIONS: Record<string, string | string[]> = {
  '/app': [],
  '/time': 'time.view_own',
  '/projects': 'projects.view',
  '/screenshots': 'screenshots.view_own',
  '/activity': 'activity.view_own',
  '/invoices': 'invoices.view',
  '/team': 'users.view',
  '/analytics': ['reports.view_own', 'reports.view_team'],
  '/billing': 'settings.billing',
  '/settings': 'settings.view',
  '/admin': '__super_admin__',
  '/team/member': ['time.view_team', 'screenshots.view_team', 'activity.view_team'],
};

export function isOrgAdmin(user: User | null | undefined): boolean {
  if (!user) return false;
  if (user.is_org_admin) return true;
  const role = user.organization_role ?? user.role;
  return role === 'owner' || role === 'admin' || role === 'manager';
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
  return hasPermission(user, rule);
}

export function getNavItemsForUser(user: User | null | undefined): NavItem[] {
  const items = ALL_NAV_ITEMS.filter((item) => {
    if (!item.permission) return true;
    return hasPermission(user, item.permission);
  });

  if (isSuperAdmin(user)) {
    items.push(ADMIN_NAV_ITEM);
  }

  return items;
}

export function canManageTeam(user: User | null | undefined): boolean {
  return hasPermission(user, 'users.create') || hasPermission(user, 'users.edit');
}

export function canViewMemberTracking(user: User | null | undefined): boolean {
  return hasAnyPermission(user, ['time.view_team', 'screenshots.view_team', 'activity.view_team', 'reports.view_team']);
}
