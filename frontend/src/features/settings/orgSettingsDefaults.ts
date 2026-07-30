import type { OrgTrackingSettings, OrgTimesheetSettings, OrgOfficeSettings, Organization } from '../../types';

export const DEFAULT_TRACKING: OrgTrackingSettings = {
  screenshot_enabled: true,
  screenshot_only_while_timer: true,
  screenshot_frequency_minutes: 5,
  screenshot_quality: 'normal',
  screenshot_retention_days: 90,
  screenshot_hide_from_users: false,
  screenshot_disallow_deleting: false,
  screenshot_suppress_notifications: false,
  activity_tracking_enabled: true,
  url_tracking_enabled: true,
  idle_timeout_minutes: 5,
  keep_idle_time: 'prompt',
  max_session_hours: 12,
  timer_tolerance_minutes: 2,
  timer_reminder_enabled: true,
  automated_tracking: true,
};

export const DEFAULT_TIMESHEET: OrgTimesheetSettings = {
  require_approval: true,
  pay_period: 'weekly',
  allow_modify_time: true,
  require_reason_on_edit: false,
};

export const DEFAULT_OFFICE: OrgOfficeSettings = {
  auto_detect_enabled: false,
};

export function mergeOrgSettings(org?: Organization | null) {
  return {
    tracking: { ...DEFAULT_TRACKING, ...(org?.settings?.tracking ?? {}) },
    timesheet: { ...DEFAULT_TIMESHEET, ...(org?.settings?.timesheet ?? {}) },
    office: { ...DEFAULT_OFFICE, ...(org?.settings?.office ?? {}) },
    default_daily_hours: org?.settings?.default_daily_hours ?? 8,
  };
}
