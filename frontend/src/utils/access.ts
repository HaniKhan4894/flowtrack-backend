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
  /** Plan feature key required (boolean or truthy tier string). */
  feature?: string;
  showIf?: (user: User | null | undefined) => boolean;
}

export interface NavGroup {
  id: string;
  label: string;
  items: NavItem[];
}

const ALL_NAV_GROUPS: NavGroup[] = [
  {
    id: 'work',
    label: 'Work',
    items: [
      { icon: LayoutDashboard, label: 'Dashboard', path: '/app' },
      { icon: Clock, label: 'Time Tracking', path: '/time', permission: 'time.view_own' },
      { icon: ClipboardList, label: 'Timesheets', path: '/timesheets', permission: 'timesheet.submit' },
      {
        icon: Briefcase,
        label: 'Projects',
        path: '/projects',
        showIf: (user) => canManageProjects(user),
      },
    ],
  },
  {
    id: 'people',
    label: 'People',
    items: [
      {
        icon: Users,
        label: 'Team',
        path: '/team',
        showIf: (user) => canViewTeam(user),
      },
      { icon: CalendarDays, label: 'Leave', path: '/leave' },
      {
        icon: Camera,
        label: 'Screenshots',
        path: '/screenshots',
        feature: 'screenshots',
        showIf: (user) => canAccessScreenshotsPage(user),
      },
      {
        icon: Activity,
        label: 'Activity',
        path: '/activity',
        permission: 'activity.view_own',
        feature: 'activity_tracking',
      },
      {
        icon: Rss,
        label: 'Activity Feed',
        path: '/activity-feed',
        feature: 'activity_tracking',
      },
    ],
  },
  {
    id: 'money',
    label: 'Money',
    items: [
      { icon: Building2, label: 'Clients', path: '/clients', permission: 'invoices.view', feature: 'invoicing' },
      { icon: FileText, label: 'Invoices', path: '/invoices', permission: 'invoices.view', feature: 'invoicing' },
      { icon: Wallet, label: 'Payroll', path: '/payroll', permission: 'payroll.view', feature: 'payroll' },
      { icon: CreditCard, label: 'Billing', path: '/billing', permission: 'settings.billing' },
    ],
  },
  {
    id: 'insights',
    label: 'Insights',
    items: [
      { icon: Sparkles, label: 'Analytics', path: '/analytics', permission: 'reports.view_own' },
      {
        icon: Brain,
        label: 'Insights',
        path: '/insights',
        permission: 'reports.view_own',
        feature: 'ai_insights',
      },
      {
        icon: MessageSquare,
        label: 'Standup',
        path: '/standup',
        permission: 'reports.view_own',
        feature: 'ai_insights',
      },
      {
        icon: HeartPulse,
        label: 'Wellbeing',
        path: '/wellbeing',
        permission: 'reports.view_own',
        feature: 'wellbeing',
      },
      {
        icon: FileCheck,
        label: 'Proof of Work',
        path: '/proof-of-work',
        feature: 'proof_of_work',
        showIf: (user) => canViewTeam(user),
      },
    ],
  },
  {
    id: 'connect',
    label: 'Connect',
    items: [
      {
        icon: Plug,
        label: 'Integrations',
        path: '/integrations',
        feature: 'integrations',
        showIf: (user) => canManageIntegrations(user),
      },
    ],
  },
];

/** Flat list kept for command palette / path lookups. */
const ALL_NAV_ITEMS: NavItem[] = ALL_NAV_GROUPS.flatMap((g) => g.items);

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

const PATH_FEATURES: Record<string, string> = {
  '/clients': 'invoicing',
  '/invoices': 'invoicing',
  '/payroll': 'payroll',
  '/screenshots': 'screenshots',
  '/activity': 'activity_tracking',
  '/activity-feed': 'activity_tracking',
  '/insights': 'ai_insights',
  '/standup': 'ai_insights',
  '/wellbeing': 'wellbeing',
  '/proof-of-work': 'proof_of_work',
  '/integrations': 'integrations',
  '/integrations/jira': 'integrations',
  '/integrations/github': 'integrations',
  '/integrations/slack': 'integrations',
};

/** True when the org plan includes this feature (boolean true or non-false tier string). */
export function hasPlanFeature(user: User | null | undefined, featureKey: string): boolean {
  if (!user?.features) return false;
  const value = user.features[featureKey];
  if (value === true) return true;
  if (value === false || value === 0 || value === 'false' || value === '0') return false;
  if (typeof value === 'string' && value.length > 0) return true;
  if (typeof value === 'number' && value > 0) return true;
  return false;
}

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

function navItemVisible(user: User | null | undefined, item: NavItem): boolean {
  if (item.feature && !hasPlanFeature(user, item.feature)) return false;
  if (item.showIf) return item.showIf(user);
  if (!item.permission) return true;
  return hasPermission(user, item.permission);
}

export function canAccessPath(user: User | null | undefined, path: string): boolean {
  if (!user) return false;

  if (path.startsWith('/admin')) {
    return isSuperAdmin(user);
  }

  if (path.startsWith('/team/member')) {
    return hasAnyPermission(user, ['time.view_team', 'screenshots.view_team', 'activity.view_team', 'reports.view_team']);
  }

  const featureKey = PATH_FEATURES[path];
  if (featureKey && !hasPlanFeature(user, featureKey)) {
    return false;
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

/** Whether a denied path is due to plan (vs permission) — used to route to billing. */
export function isPathPlanLocked(user: User | null | undefined, path: string): boolean {
  if (!user) return false;
  const featureKey = PATH_FEATURES[path];
  if (!featureKey) return false;
  return !hasPlanFeature(user, featureKey);
}

export function getNavItemsForUser(user: User | null | undefined): NavItem[] {
  return ALL_NAV_ITEMS.filter((item) => navItemVisible(user, item));
}

export function getNavGroupsForUser(user: User | null | undefined): NavGroup[] {
  return ALL_NAV_GROUPS
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => navItemVisible(user, item)),
    }))
    .filter((group) => group.items.length > 0);
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
  if (!hasPlanFeature(user, 'screenshots')) return false;
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
