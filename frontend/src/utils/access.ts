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
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  icon: LucideIcon;
  label: string;
  path: string;
}

const ALL_NAV_ITEMS: NavItem[] = [
  { icon: LayoutDashboard, label: 'Dashboard', path: '/app' },
  { icon: Clock, label: 'Time Tracking', path: '/time' },
  { icon: Briefcase, label: 'Projects', path: '/projects' },
  { icon: Camera, label: 'Screenshots', path: '/screenshots' },
  { icon: Activity, label: 'Activity', path: '/activity' },
  { icon: FileText, label: 'Invoices', path: '/invoices' },
  { icon: Users, label: 'Team', path: '/team' },
  { icon: Sparkles, label: 'Analytics', path: '/analytics' },
  { icon: CreditCard, label: 'Billing', path: '/billing' },
  { icon: Settings, label: 'Settings', path: '/settings' },
];

const TRACKER_MEMBER_PATHS = new Set(['/app', '/time', '/activity', '/screenshots']);

export function isOrgAdmin(user: User | null | undefined): boolean {
  if (!user) return false;
  if (user.is_org_admin) return true;
  const role = user.organization_role ?? user.role;
  return role === 'owner' || role === 'admin' || role === 'manager';
}

export function hasPermission(user: User | null | undefined, slug: string): boolean {
  if (!user?.permissions?.length) return false;
  return user.permissions.includes(slug);
}

export function getNavItemsForUser(user: User | null | undefined): NavItem[] {
  if (isOrgAdmin(user)) {
    return ALL_NAV_ITEMS;
  }
  return ALL_NAV_ITEMS.filter((item) => TRACKER_MEMBER_PATHS.has(item.path));
}

export function canAccessPath(user: User | null | undefined, path: string): boolean {
  if (isOrgAdmin(user)) return true;
  return TRACKER_MEMBER_PATHS.has(path);
}
