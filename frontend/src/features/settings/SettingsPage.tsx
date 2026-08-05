import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { User, Building, Bell, Shield, Cloud, Save, Camera, Loader2, CheckCircle2, Lock, CreditCard, ExternalLink, Gauge, Users, Plus, Pencil, Trash2, Activity, FileCheck, Sparkles, MapPin, KeyRound, Palette, RefreshCw } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { motion, AnimatePresence } from 'framer-motion';
import client from '../../api/client';
import { organizationService } from '../../api/organizationService';
import { locationService } from '../../api/locationService';
import { authService } from '../../api/authService';
import { userService } from '../../api/userService';
import { billingService } from '../../api/billingService';
import { scheduledReportService, type ScheduledReport } from '../../api/scheduledReportService';
import { taxTemplateService, type PayrollTaxTemplate } from '../../api/taxTemplateService';
import { getApiErrorMessage } from '../../utils/apiError';
import { hasPermission, hasPlanFeature } from '../../utils/access';
import { formatApiDate } from '../../utils/date';
import { productivityRuleService, activityRecategorizeService } from '../../api/productivityRuleService';
import { roleService } from '../../api/roleService';
import { notificationPreferenceService } from '../../api/notificationPreferenceService';
import { Link, useNavigate } from 'react-router-dom';
import type { Country, State, City, TimezoneOption, ProductivityRule, Role, Permission, NotificationPreference } from '../../types';
import { Modal, SearchableSelect } from '../../components/ui';
import { ThemePreferencePicker } from '../../components/ThemeToggle';
import { ActivityTrackingSettingsTab } from './ActivityTrackingSettingsTab';
import { TimesheetPolicySettingsTab } from './TimesheetPolicySettingsTab';
import { SmartNotificationsSettingsTab } from './SmartNotificationsSettingsTab';
import { OfficeLocationsSettingsTab } from './OfficeLocationsSettingsTab';
import DeveloperSettings from './DeveloperSettings';

const CURRENCY_OPTIONS = [
  { value: 'USD', label: 'USD — US Dollar' },
  { value: 'EUR', label: 'EUR — Euro' },
  { value: 'GBP', label: 'GBP — British Pound' },
  { value: 'PKR', label: 'PKR — Pakistani Rupee' },
  { value: 'INR', label: 'INR — Indian Rupee' },
  { value: 'AED', label: 'AED — UAE Dirham' },
  { value: 'SAR', label: 'SAR — Saudi Riyal' },
  { value: 'CAD', label: 'CAD — Canadian Dollar' },
  { value: 'AUD', label: 'AUD — Australian Dollar' },
];

function mergeSelectedCity(
  cities: City[],
  city?: { id: number; name: string } | null,
): City[] {
  if (!city?.id) return cities;
  if (cities.some((c) => c.id === city.id)) return cities;
  return [{ id: city.id, name: city.name, state_id: 0, country_id: 0, country_code: '' }, ...cities];
}

const SettingsPage = () => {
  const navigate = useNavigate();
  const { user, setUser } = useAuthStore();
  const [activeTab, setActiveTab] = useState(() => {
    if (typeof window === 'undefined') return 'profile';
    const tab = new URLSearchParams(window.location.search).get('tab');
    if (tab === 'integrations') return 'profile';
    return tab || 'profile';
  });
  const [isSaving, setIsSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [profileForm, setProfileForm] = useState({
    first_name: user?.first_name ?? '',
    last_name: user?.last_name ?? '',
  });

  const [orgForm, setOrgForm] = useState({
    name: '',
    country_id: '' as string | number,
    state_id: '' as string | number,
    city_id: '' as string | number,
    timezone_id: '' as string | number,
    currency: 'USD',
    default_daily_hours: '8',
  });

  const [countries, setCountries] = useState<Country[]>([]);
  const [states, setStates] = useState<State[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [citiesLoading, setCitiesLoading] = useState(false);
  const [timezones, setTimezones] = useState<TimezoneOption[]>([]);
  const [citySearch, setCitySearch] = useState('');
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const selectedCityRef = useRef<{ id: number; name: string } | null>(null);

  const [securityForm, setSecurityForm] = useState({
    current_password: '',
    new_password: '',
    confirm_password: '',
  });
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [securitySuccess, setSecuritySuccess] = useState<string | null>(null);

  const [subscription, setSubscription] = useState<{
    status: string;
    billing_cycle: string;
    amount: number;
    current_period_end: string;
  } | null>(null);
  const [billingLoading, setBillingLoading] = useState(false);

  const canEditOrg = hasPermission(user, 'settings.edit');
  const canViewOrg = hasPermission(user, 'settings.view') || canEditOrg;
  const canManageBilling = hasPermission(user, 'settings.billing');
  const canManageProductivityRules = hasPermission(user, 'productivity_rules.manage')
    && hasPlanFeature(user, 'productivity_rules');
  const canUseDeveloperApi = hasPlanFeature(user, 'api_access');
  const canManagePayroll = hasPermission(user, 'payroll.manage') && hasPlanFeature(user, 'payroll');

  const [productivityRules, setProductivityRules] = useState<ProductivityRule[]>([]);
  const [rulesLoading, setRulesLoading] = useState(false);
  const [recategorizing, setRecategorizing] = useState(false);
  const [showRuleModal, setShowRuleModal] = useState(false);
  const [editingRule, setEditingRule] = useState<ProductivityRule | null>(null);
  const [ruleForm, setRuleForm] = useState({
    rule_type: 'app' as ProductivityRule['rule_type'],
    pattern: '',
    category: 'productive' as ProductivityRule['category'],
    is_active: true,
  });

  const [roles, setRoles] = useState<Role[]>([]);
  const [permissionsGrouped, setPermissionsGrouped] = useState<Record<string, Permission[]>>({});
  const [rolePermissionIds, setRolePermissionIds] = useState<Record<number, number[]>>({});
  const [rolesLoading, setRolesLoading] = useState(false);
  const [savingRoleId, setSavingRoleId] = useState<number | null>(null);
  const [newRoleName, setNewRoleName] = useState('');
  const [renameModal, setRenameModal] = useState<{ role: Role; name: string } | null>(null);

  const [notificationPrefs, setNotificationPrefs] = useState<NotificationPreference[]>([]);
  const [prefsLoading, setPrefsLoading] = useState(false);
  const [prefsSaving, setPrefsSaving] = useState(false);

  const [twoFactorSetup, setTwoFactorSetup] = useState<{ secret: string; otpauth_url: string } | null>(null);
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [twoFactorLoading, setTwoFactorLoading] = useState(false);
  const [disable2FAForm, setDisable2FAForm] = useState({ password: '', code: '' });
  const [sessions, setSessions] = useState<Array<{ id: number; device_info?: string | null; ip_address?: string | null; expires_at: string; created_at: string }>>([]);
  const [securitySubTab, setSecuritySubTab] = useState<'password' | '2fa' | 'sessions'>('password');
  const [scheduledReports, setScheduledReports] = useState<ScheduledReport[]>([]);
  const [taxTemplates, setTaxTemplates] = useState<PayrollTaxTemplate[]>([]);
  const [reportForm, setReportForm] = useState({ report_type: 'time_summary', cadence: 'weekly' as ScheduledReport['cadence'], recipients: '', format: 'csv' as ScheduledReport['format'] });
  const [taxForm, setTaxForm] = useState({ name: '', type: 'percentage' as 'percentage' | 'fixed', rate: '', amount: '' });

  const tabs = useMemo(() => [
    { id: 'profile', label: 'Profile Settings', icon: User },
    { id: 'appearance', label: 'Appearance', icon: Palette },
    ...(canViewOrg ? [{ id: 'organization', label: 'Organization', icon: Building }] : []),
    ...(canManageProductivityRules ? [{ id: 'productivity-rules', label: 'Productivity Rules', icon: Gauge }] : []),
    ...(canEditOrg ? [
      { id: 'activity-tracking', label: 'Activity & Tracking', icon: Activity },
      { id: 'timesheet-policies', label: 'Timesheet Policies', icon: FileCheck },
      { id: 'smart-notifications', label: 'Smart Notifications', icon: Sparkles },
      { id: 'office-locations', label: 'Remote vs Office', icon: MapPin },
      { id: 'roles-permissions', label: 'Roles & Permissions', icon: Users },
      ...(canUseDeveloperApi ? [{ id: 'developer', label: 'Developer', icon: KeyRound }] : []),
    ] : []),
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'security', label: 'Security', icon: Shield },
    ...(canManageBilling ? [{ id: 'billing', label: 'Billing & Plans', icon: Cloud }] : []),
  ], [canViewOrg, canManageProductivityRules, canEditOrg, canUseDeveloperApi, canManageBilling]);

  useEffect(() => {
    if (!tabs.some((tab) => tab.id === activeTab)) {
      setActiveTab('profile');
    }
  }, [activeTab, tabs]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('tab') === 'integrations') {
      navigate('/integrations', { replace: true });
    }
  }, [navigate]);

  const loadOrg = useCallback(async () => {
    if (!user?.organization_id || !canViewOrg) return;
    try {
      const resp = await organizationService.get(user.organization_id);
      const org = resp.data;
      setOrgForm({
        name: org.name,
        country_id: org.country_id ?? '',
        state_id: org.state_id ?? '',
        city_id: org.city_id ?? '',
        timezone_id: org.timezone_id ?? '',
        currency: org.currency ?? 'USD',
        default_daily_hours: String(org.settings?.default_daily_hours ?? 8),
      });
      selectedCityRef.current = org.city ?? null;
      if (org.country_id) {
        const statesResp = await locationService.getStates(org.country_id);
        setStates(statesResp.data);
      }
      if (org.state_id) {
        const citiesResp = await locationService.searchCities(org.state_id, undefined, org.city_id ?? undefined);
        setCities(mergeSelectedCity(citiesResp.data ?? [], org.city));
      }
    } catch (e) {
      console.error(e);
    }
  }, [user?.organization_id, canViewOrg]);

  useEffect(() => {
    locationService.getCountries().then((r) => setCountries(r.data)).catch(() => undefined);
    locationService.getTimezones().then((r) => setTimezones(r.data)).catch(() => undefined);
    loadOrg();
  }, [loadOrg]);

  useEffect(() => {
    if (!orgForm.country_id) {
      setStates([]);
      return;
    }
    locationService.getStates(Number(orgForm.country_id)).then((r) => setStates(r.data)).catch(() => undefined);
  }, [orgForm.country_id]);

  useEffect(() => {
    if (!orgForm.state_id) {
      setCities([]);
      setCitySearch('');
      return;
    }
    setCitiesLoading(true);
    const timer = setTimeout(() => {
      locationService.searchCities(
        Number(orgForm.state_id),
        citySearch || undefined,
        orgForm.city_id ? Number(orgForm.city_id) : undefined,
      )
        .then((r) => setCities(mergeSelectedCity(r.data ?? [], selectedCityRef.current)))
        .catch(() => setCities([]))
        .finally(() => setCitiesLoading(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [orgForm.state_id, citySearch, orgForm.city_id]);

  useEffect(() => {
    let objectUrl: string | null = null;
    if (!user?.id) return;

    userService.fetchAvatarUrl(user.id).then((url) => {
      if (url) {
        objectUrl = url;
        setAvatarPreview(url);
      }
    }).catch(() => undefined);

    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [user?.id, user?.avatar_url]);

  useEffect(() => {
    if (activeTab !== 'security') return;
    authService.getSessions().then((r) => setSessions(r.data ?? [])).catch(() => setSessions([]));
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== 'notifications' || !canEditOrg) return;
    scheduledReportService.getAll().then((r) => setScheduledReports(r.data ?? [])).catch(() => setScheduledReports([]));
  }, [activeTab, canEditOrg]);

  useEffect(() => {
    if (activeTab !== 'organization' || !canManagePayroll) return;
    taxTemplateService.getAll().then((r) => setTaxTemplates(r.data ?? [])).catch(() => setTaxTemplates([]));
  }, [activeTab, canManagePayroll]);

  useEffect(() => {
    if (activeTab !== 'billing') return;
    setBillingLoading(true);
    billingService.getSubscription()
      .then((r) => setSubscription(r.data))
      .catch(() => setSubscription(null))
      .finally(() => setBillingLoading(false));
  }, [activeTab]);

  const loadProductivityRules = useCallback(async () => {
    setRulesLoading(true);
    try {
      const resp = await productivityRuleService.getAll();
      setProductivityRules(resp.data ?? []);
    } catch {
      setProductivityRules([]);
    } finally {
      setRulesLoading(false);
    }
  }, []);

  const loadRolesData = useCallback(async () => {
    setRolesLoading(true);
    try {
      const [rolesResp, permsResp] = await Promise.all([
        roleService.getRoles(),
        roleService.getPermissions(),
      ]);
      const roleList = rolesResp.data ?? [];
      setRoles(roleList);
      setPermissionsGrouped(permsResp.data ?? {});

      const map: Record<number, number[]> = {};
      for (const role of roleList) {
        map[role.id] = role.permission_ids ?? [];
      }
      setRolePermissionIds(map);
    } catch {
      setRoles([]);
      setPermissionsGrouped({});
    } finally {
      setRolesLoading(false);
    }
  }, []);

  const loadNotificationPrefs = useCallback(async () => {
    setPrefsLoading(true);
    try {
      const resp = await notificationPreferenceService.get();
      setNotificationPrefs(resp.data ?? []);
    } catch {
      setNotificationPrefs([]);
    } finally {
      setPrefsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'productivity-rules') loadProductivityRules();
    if (activeTab === 'roles-permissions') loadRolesData();
    if (activeTab === 'notifications') loadNotificationPrefs();
  }, [activeTab, loadProductivityRules, loadRolesData, loadNotificationPrefs]);

  const openRuleModal = (rule?: ProductivityRule) => {
    setEditingRule(rule ?? null);
    setRuleForm({
      rule_type: rule?.rule_type ?? 'app',
      pattern: rule?.pattern ?? '',
      category: rule?.category ?? 'productive',
      is_active: rule?.is_active ?? true,
    });
    setShowRuleModal(true);
  };

  const handleSaveRule = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setError(null);
    try {
      if (editingRule) {
        await productivityRuleService.update(editingRule.id, ruleForm);
      } else {
        await productivityRuleService.create(ruleForm);
      }
      setShowRuleModal(false);
      await loadProductivityRules();
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, 'Failed to save rule'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteRule = async (id: number) => {
    if (!confirm('Delete this productivity rule?')) return;
    try {
      await productivityRuleService.delete(id);
      await loadProductivityRules();
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, 'Failed to delete rule'));
    }
  };

  const toggleRolePermission = async (roleId: number, permissionId: number, role: Role) => {
    if (role.is_system || role.organization_id == null) return;
    const current = rolePermissionIds[roleId] ?? [];
    const next = current.includes(permissionId)
      ? current.filter((id) => id !== permissionId)
      : [...current, permissionId];
    setRolePermissionIds((prev) => ({ ...prev, [roleId]: next }));
    setSavingRoleId(roleId);
    try {
      await roleService.updatePermissions(roleId, next);
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, 'Failed to update permissions'));
      setRolePermissionIds((prev) => ({ ...prev, [roleId]: current }));
    } finally {
      setSavingRoleId(null);
    }
  };

  const handleCreateRole = async () => {
    if (!newRoleName.trim()) return;
    setIsSaving(true);
    try {
      await roleService.create({ name: newRoleName.trim() });
      setNewRoleName('');
      await loadRolesData();
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, 'Failed to create role'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveNotificationPrefs = async () => {
    setPrefsSaving(true);
    setError(null);
    try {
      const resp = await notificationPreferenceService.update(notificationPrefs);
      setNotificationPrefs(resp.data ?? []);
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, 'Failed to save notification preferences'));
    } finally {
      setPrefsSaving(false);
    }
  };

  const toggleNotificationPref = (eventKey: string, field: 'email_enabled' | 'in_app_enabled') => {
    setNotificationPrefs((prev) =>
      prev.map((p) => (p.event_key === eventKey ? { ...p, [field]: !p[field] } : p)),
    );
  };

  const allPermissions = Object.values(permissionsGrouped).flat();

  const isCustomRole = (role: Role) => !role.is_system && role.organization_id != null;

  const handleDeleteRole = async (role: Role) => {
    if (!isCustomRole(role)) return;
    if (!window.confirm(`Delete role "${role.name}"? Members with this role will be reassigned to Member.`)) return;
    setIsSaving(true);
    setError(null);
    try {
      await roleService.delete(role.id);
      await loadRolesData();
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, 'Failed to delete role'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleRenameRole = (role: Role) => {
    if (!isCustomRole(role)) return;
    setRenameModal({ role, name: role.name });
  };

  const handleRenameSubmit = async () => {
    if (!renameModal) return;
    const { role, name } = renameModal;
    if (!name.trim() || name.trim() === role.name) { setRenameModal(null); return; }
    setIsSaving(true);
    setError(null);
    try {
      await roleService.update(role.id, { name: name.trim() });
      setRenameModal(null);
      await loadRolesData();
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, 'Failed to rename role'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleSelectAllForRole = async (role: Role) => {
    if (!isCustomRole(role)) return;
    const allPermIds = allPermissions.map((p) => p.id);
    const current = rolePermissionIds[role.id] ?? [];
    const allSelected = allPermIds.every((id) => current.includes(id));
    const next = allSelected ? [] : allPermIds;
    setRolePermissionIds((prev) => ({ ...prev, [role.id]: next }));
    setSavingRoleId(role.id);
    try {
      await roleService.updatePermissions(role.id, next);
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, 'Failed to update permissions'));
      await loadRolesData();
    } finally {
      setSavingRoleId(null);
    }
  };

  const handleAvatarSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user?.id) return;

    if (file.size > 5 * 1024 * 1024) {
      setError('Image must be 5MB or smaller');
      return;
    }

    setIsUploadingAvatar(true);
    setError(null);
    try {
      const resp = await userService.uploadAvatar(user.id, file);
      if (user) setUser({ ...user, avatar_url: resp.data.avatar_url });
      const url = await userService.fetchAvatarUrl(user.id);
      if (url) {
        if (avatarPreview) URL.revokeObjectURL(avatarPreview);
        setAvatarPreview(url);
      }
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, 'Failed to upload image'));
    } finally {
      setIsUploadingAvatar(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleChangePassword = async () => {
    setIsChangingPassword(true);
    setError(null);
    setSecuritySuccess(null);
    try {
      const resp = await authService.changePassword(
        securityForm.current_password,
        securityForm.new_password,
        securityForm.confirm_password,
      );
      setSecuritySuccess(resp.message || 'Password changed successfully');
      setSecurityForm({ current_password: '', new_password: '', confirm_password: '' });
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, 'Failed to change password'));
    } finally {
      setIsChangingPassword(false);
    }
  };

  const handleSaveProfile = async () => {
    setIsSaving(true);
    setError(null);
    try {
      await client.put(`/users/${user?.id}`, profileForm);
      if (user) setUser({ ...user, ...profileForm });
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    } catch (e: unknown) {
      setError(getApiErrorMessage(e, 'Failed to save profile'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveOrg = async () => {
    if (!user?.organization_id || !canEditOrg) return;
    setIsSaving(true);
    setError(null);
    try {
      const payload = {
        name: orgForm.name,
        country_id: orgForm.country_id ? Number(orgForm.country_id) : null,
        state_id: orgForm.state_id ? Number(orgForm.state_id) : null,
        city_id: orgForm.city_id ? Number(orgForm.city_id) : null,
        timezone_id: orgForm.timezone_id ? Number(orgForm.timezone_id) : null,
        currency: orgForm.currency || 'USD',
        settings: { default_daily_hours: parseFloat(orgForm.default_daily_hours) || 8 },
      };
      const resp = await organizationService.update(user.organization_id, payload);
      selectedCityRef.current = resp.data.city ?? null;
      setCities((prev) => mergeSelectedCity(prev, resp.data.city));
      const tz = timezones.find((t) => t.id === Number(orgForm.timezone_id));
      if (user) {
        setUser({
          ...user,
          organization: {
            id: user.organization_id,
            name: resp.data.name,
            php_timezone: tz?.php_timezone ?? user.organization?.php_timezone ?? 'UTC',
            country_id: payload.country_id,
            state_id: payload.state_id,
            city_id: payload.city_id,
            timezone_id: payload.timezone_id,
            currency: payload.currency,
            timezone: tz ? { id: tz.id, timezone: tz.timezone, php_timezone: tz.php_timezone } : user.organization?.timezone,
          },
        });
      }
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    } catch (e: unknown) {
      setError(getApiErrorMessage(e, 'Failed to save organization'));
    } finally {
      setIsSaving(false);
    }
  };

  const inputClass = 'w-full h-12 bg-[#12141C] border border-white/10 rounded-xl px-4 text-white focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500/50 outline-none transition-all';

  return (
    <div className="space-y-8 pb-12">
      <AnimatePresence>
        {showSuccess && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="fixed bottom-12 right-12 z-50 bg-emerald-500 text-white px-6 py-3 rounded-2xl shadow-ai flex items-center gap-3"
          >
            <CheckCircle2 size={20} />
            <span className="font-bold">Settings saved successfully!</span>
          </motion.div>
        )}
      </AnimatePresence>

      <div>
        <h1 className="text-3xl font-bold text-white mb-2">Account Settings</h1>
        <p className="text-slate-400">Manage your profile, organization, and preferences.</p>
      </div>

      {error && <p className="text-rose-400 text-sm">{error}</p>}

      <div className="flex flex-col lg:flex-row gap-8">
        <div className="lg:w-64 flex-shrink-0 space-y-2">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-all duration-300 font-medium ${
                  activeTab === tab.id
                    ? 'bg-primary-500/10 text-primary-400 border border-primary-500/20 shadow-ai'
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <Icon size={20} />
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="flex-1 glass border border-white/5 rounded-3xl p-8 shadow-ai">
          {activeTab === 'profile' && (
            <div className="space-y-8 max-w-2xl">
              <div className="flex items-center gap-6">
                <div className="relative group">
                  {avatarPreview ? (
                    <img
                      src={avatarPreview}
                      alt="Profile"
                      className="w-24 h-24 rounded-3xl object-cover shadow-ai border border-white/10"
                    />
                  ) : (
                    <div className="w-24 h-24 rounded-3xl bg-ai-gradient flex items-center justify-center text-3xl font-bold text-white shadow-ai">
                      {user?.first_name?.[0]}{user?.last_name?.[0]}
                    </div>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    className="hidden"
                    onChange={handleAvatarSelect}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploadingAvatar}
                    className="absolute -bottom-2 -right-2 p-2 bg-primary-500 text-white rounded-xl shadow-lg border-2 border-[#12141C] disabled:opacity-50"
                  >
                    {isUploadingAvatar ? <Loader2 size={16} className="animate-spin" /> : <Camera size={16} />}
                  </button>
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white mb-1">Profile Photo</h3>
                  <p className="text-sm text-slate-400">JPEG, PNG or GIF. Max 5MB.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-400 uppercase tracking-wider ml-1">First Name</label>
                  <input
                    type="text"
                    value={profileForm.first_name}
                    onChange={(e) => setProfileForm((prev) => ({ ...prev, first_name: e.target.value }))}
                    className={inputClass}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-400 uppercase tracking-wider ml-1">Last Name</label>
                  <input
                    type="text"
                    value={profileForm.last_name}
                    onChange={(e) => setProfileForm((prev) => ({ ...prev, last_name: e.target.value }))}
                    className={inputClass}
                  />
                </div>
                <div className="md:col-span-2 space-y-2">
                  <label className="text-sm font-bold text-slate-400 uppercase tracking-wider ml-1">Email Address</label>
                  <input type="email" readOnly defaultValue={user?.email} className={`${inputClass} text-slate-500 cursor-not-allowed`} />
                </div>
              </div>

              <div className="pt-4 flex justify-end">
                <button onClick={handleSaveProfile} disabled={isSaving} className="flex items-center gap-2 bg-ai-gradient text-white px-10 py-3 rounded-2xl font-bold shadow-ai disabled:opacity-50">
                  {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save size={20} />}
                  {isSaving ? 'Updating...' : 'Save Changes'}
                </button>
              </div>
            </div>
          )}

          {activeTab === 'appearance' && (
            <div className="space-y-6 max-w-2xl">
              <div>
                <h3 className="text-xl font-bold text-white mb-1">Appearance</h3>
                <p className="text-sm text-slate-400">
                  Choose how FlowTrack looks. Dark is the default brand look; Light and System are optional.
                </p>
              </div>
              <div className="space-y-3">
                <label className="text-sm font-bold text-slate-400 uppercase tracking-wider ml-1">Color theme</label>
                <ThemePreferencePicker />
              </div>
            </div>
          )}

          {activeTab === 'organization' && (
            <div className="space-y-6 max-w-2xl">
              <div>
                <h3 className="text-xl font-bold text-white mb-1">Organization Settings</h3>
                <p className="text-sm text-slate-400">Set your team location and timezone. All times display in your org timezone (stored as UTC).</p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-400 uppercase tracking-wider ml-1">Organization Name</label>
                <input
                  type="text"
                  value={orgForm.name}
                  onChange={(e) => setOrgForm((p) => ({ ...p, name: e.target.value }))}
                  disabled={!canEditOrg}
                  className={inputClass}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-400 uppercase tracking-wider ml-1">Country</label>
                  <SearchableSelect
                    value={orgForm.country_id}
                    onChange={(v) => setOrgForm((p) => ({ ...p, country_id: v, state_id: '', city_id: '' }))}
                    options={countries.map((c) => ({
                      value: c.id,
                      label: `${c.emoji ? `${c.emoji} ` : ''}${c.name}`,
                    }))}
                    placeholder="Select country"
                    searchPlaceholder="Search country…"
                    disabled={!canEditOrg}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-400 uppercase tracking-wider ml-1">State / Province</label>
                  <SearchableSelect
                    value={orgForm.state_id}
                    onChange={(v) => setOrgForm((p) => ({ ...p, state_id: v, city_id: '' }))}
                    options={states.map((s) => ({ value: s.id, label: s.name }))}
                    placeholder="Select state"
                    searchPlaceholder="Search state…"
                    disabled={!canEditOrg || !orgForm.country_id}
                    emptyMessage={orgForm.country_id ? 'No states found' : 'Select a country first'}
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-bold text-slate-400 uppercase tracking-wider ml-1">City</label>
                  <SearchableSelect
                    value={orgForm.city_id}
                    onChange={(v) => setOrgForm((p) => ({ ...p, city_id: v }))}
                    options={cities.map((c) => ({ value: c.id, label: c.name }))}
                    placeholder="Select city"
                    searchPlaceholder="Search city…"
                    disabled={!canEditOrg || !orgForm.state_id}
                    emptyMessage={orgForm.state_id ? 'No cities found' : 'Select a state first'}
                    onSearchChange={setCitySearch}
                    isLoading={citiesLoading}
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-bold text-slate-400 uppercase tracking-wider ml-1">Timezone</label>
                  <SearchableSelect
                    value={orgForm.timezone_id}
                    onChange={(v) => setOrgForm((p) => ({ ...p, timezone_id: v }))}
                    options={timezones.map((tz) => ({
                      value: tz.id,
                      label: `${tz.zone_group} — ${tz.timezone} (${tz.php_timezone})`,
                    }))}
                    placeholder="Select timezone"
                    searchPlaceholder="Search timezone…"
                    disabled={!canEditOrg}
                  />
                  {user?.organization?.php_timezone && (
                    <p className="text-xs text-slate-500 ml-1">Current: {user.organization.php_timezone}</p>
                  )}
                </div>
                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-bold text-slate-400 uppercase tracking-wider ml-1">Currency</label>
                  <SearchableSelect
                    value={orgForm.currency}
                    onChange={(v) => setOrgForm((p) => ({ ...p, currency: String(v) }))}
                    options={CURRENCY_OPTIONS}
                    placeholder="Select currency"
                    searchPlaceholder="Search currency…"
                    disabled={!canEditOrg}
                  />
                  <p className="text-xs text-slate-500 ml-1">Used for payroll and financial records.</p>
                </div>
                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-bold text-slate-400 uppercase tracking-wider ml-1">Default Daily Hours</label>
                  <input
                    type="number"
                    step="0.5"
                    min="1"
                    max="24"
                    value={orgForm.default_daily_hours}
                    onChange={(e) => setOrgForm((p) => ({ ...p, default_daily_hours: e.target.value }))}
                    disabled={!canEditOrg}
                    className={inputClass}
                  />
                  <p className="text-xs text-slate-500 ml-1">Organization-wide daily goal for dashboard progress (members can override).</p>
                </div>
              </div>

              {canManagePayroll && (
                <div className="pt-8 border-t border-white/10 space-y-4">
                  <h4 className="text-lg font-bold text-white">Payroll Tax Templates</h4>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <input value={taxForm.name} onChange={(e) => setTaxForm((p) => ({ ...p, name: e.target.value }))} placeholder="Template name" className={inputClass} />
                    <select value={taxForm.type} onChange={(e) => setTaxForm((p) => ({ ...p, type: e.target.value as 'percentage' | 'fixed' }))} className="form-select">
                      <option value="percentage">Percentage</option>
                      <option value="fixed">Fixed</option>
                    </select>
                    {taxForm.type === 'percentage' ? (
                      <input type="number" step="0.01" value={taxForm.rate} onChange={(e) => setTaxForm((p) => ({ ...p, rate: e.target.value }))} placeholder="Rate %" className={inputClass} />
                    ) : (
                      <input type="number" step="0.01" value={taxForm.amount} onChange={(e) => setTaxForm((p) => ({ ...p, amount: e.target.value }))} placeholder="Amount" className={inputClass} />
                    )}
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await taxTemplateService.create({
                            name: taxForm.name,
                            type: taxForm.type,
                            rate: taxForm.type === 'percentage' ? parseFloat(taxForm.rate) : null,
                            amount: taxForm.type === 'fixed' ? parseFloat(taxForm.amount) : null,
                          });
                          setTaxForm({ name: '', type: 'percentage', rate: '', amount: '' });
                          const r = await taxTemplateService.getAll();
                          setTaxTemplates(r.data ?? []);
                        } catch (err) {
                          setError(getApiErrorMessage(err, 'Failed to create template'));
                        }
                      }}
                      className="bg-primary-500 text-white rounded-xl font-bold"
                    >
                      <Plus size={16} className="inline mr-1" /> Add
                    </button>
                  </div>
                  <div className="space-y-2">
                    {taxTemplates.map((t) => (
                      <div key={t.id} className="flex items-center justify-between p-3 rounded-xl bg-white/5">
                        <span className="text-white">{t.name} ({t.type})</span>
                        <button onClick={async () => { await taxTemplateService.delete(t.id); const r = await taxTemplateService.getAll(); setTaxTemplates(r.data ?? []); }} className="text-rose-400 text-xs">Delete</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {canEditOrg && (
                <div className="pt-4 flex justify-end">
                  <button onClick={handleSaveOrg} disabled={isSaving} className="flex items-center gap-2 bg-ai-gradient text-white px-10 py-3 rounded-2xl font-bold shadow-ai disabled:opacity-50">
                    {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save size={20} />}
                    Save Organization
                  </button>
                </div>
              )}
            </div>
          )}

          {activeTab === 'security' && (
            <div className="space-y-6 max-w-xl">
              <div className="flex flex-wrap gap-2 border-b border-white/10 pb-4">
                {([
                  { id: 'password' as const, label: 'Security' },
                  { id: '2fa' as const, label: 'Two-Factor Authentication' },
                  { id: 'sessions' as const, label: 'Active Sessions' },
                ]).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setSecuritySubTab(tab.id)}
                    className={`px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                      securitySubTab === tab.id
                        ? 'bg-primary-500/10 text-primary-400 border border-primary-500/20 shadow-ai'
                        : 'text-slate-400 hover:text-white hover:bg-white/5 border border-transparent'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {securitySuccess && (
                <p className="text-emerald-400 text-sm bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-3">
                  {securitySuccess}
                </p>
              )}

              {securitySubTab === 'password' && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-xl font-bold text-white mb-1 flex items-center gap-2">
                      <Lock size={22} className="text-primary-400" />
                      Security
                    </h3>
                    <p className="text-sm text-slate-400">Update your password to keep your account secure.</p>
                  </div>

                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-slate-400 uppercase tracking-wider ml-1">Current Password</label>
                      <input
                        type="password"
                        value={securityForm.current_password}
                        onChange={(e) => setSecurityForm((p) => ({ ...p, current_password: e.target.value }))}
                        className={inputClass}
                        autoComplete="current-password"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-slate-400 uppercase tracking-wider ml-1">New Password</label>
                      <input
                        type="password"
                        value={securityForm.new_password}
                        onChange={(e) => setSecurityForm((p) => ({ ...p, new_password: e.target.value }))}
                        className={inputClass}
                        autoComplete="new-password"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-slate-400 uppercase tracking-wider ml-1">Confirm New Password</label>
                      <input
                        type="password"
                        value={securityForm.confirm_password}
                        onChange={(e) => setSecurityForm((p) => ({ ...p, confirm_password: e.target.value }))}
                        className={inputClass}
                        autoComplete="new-password"
                      />
                    </div>
                  </div>

                  <div className="pt-2 flex justify-end">
                    <button
                      onClick={handleChangePassword}
                      disabled={isChangingPassword || !securityForm.current_password || !securityForm.new_password}
                      className="flex items-center gap-2 bg-ai-gradient text-white px-10 py-3 rounded-2xl font-bold shadow-ai disabled:opacity-50"
                    >
                      {isChangingPassword ? <Loader2 className="w-5 h-5 animate-spin" /> : <Shield size={20} />}
                      {isChangingPassword ? 'Updating...' : 'Change Password'}
                    </button>
                  </div>
                </div>
              )}

              {securitySubTab === '2fa' && (
                <div className="space-y-4">
                  <div>
                    <h3 className="text-xl font-bold text-white mb-1">Two-Factor Authentication</h3>
                    <p className="text-sm text-slate-400">Add an extra layer of security to your account.</p>
                  </div>

                  {user?.two_factor_enabled ? (
                    <div className="space-y-3">
                      <p className="text-emerald-400 text-sm">2FA is enabled on your account.</p>
                      <input type="password" placeholder="Password" value={disable2FAForm.password} onChange={(e) => setDisable2FAForm((p) => ({ ...p, password: e.target.value }))} className={inputClass} />
                      <input type="text" placeholder="Authenticator code" value={disable2FAForm.code} onChange={(e) => setDisable2FAForm((p) => ({ ...p, code: e.target.value }))} className={inputClass} />
                      <button
                        type="button"
                        disabled={twoFactorLoading}
                        onClick={async () => {
                          setTwoFactorLoading(true);
                          try {
                            await authService.disable2FA(disable2FAForm.password, disable2FAForm.code);
                            const me = await authService.me();
                            setUser(me.data);
                            setSecuritySuccess('Two-factor authentication disabled');
                          } catch (err) {
                            setError(getApiErrorMessage(err, 'Failed to disable 2FA'));
                          } finally {
                            setTwoFactorLoading(false);
                          }
                        }}
                        className="text-rose-400 text-sm font-bold hover:underline"
                      >
                        Disable 2FA
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {!twoFactorSetup ? (
                        <button
                          type="button"
                          disabled={twoFactorLoading}
                          onClick={async () => {
                            setTwoFactorLoading(true);
                            try {
                              const resp = await authService.setup2FA();
                              setTwoFactorSetup(resp.data);
                            } catch (err) {
                              setError(getApiErrorMessage(err, 'Failed to start 2FA setup'));
                            } finally {
                              setTwoFactorLoading(false);
                            }
                          }}
                          className="bg-primary-500 text-white px-6 py-2.5 rounded-xl font-bold"
                        >
                          Set up 2FA
                        </button>
                      ) : (
                        <>
                          <img
                            src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(twoFactorSetup.otpauth_url)}`}
                            alt="2FA QR Code"
                            className="rounded-xl border border-white/10"
                          />
                          <input type="text" placeholder="Enter 6-digit code" value={twoFactorCode} onChange={(e) => setTwoFactorCode(e.target.value)} className={inputClass} />
                          <button
                            type="button"
                            disabled={twoFactorLoading || twoFactorCode.length < 6}
                            onClick={async () => {
                              setTwoFactorLoading(true);
                              try {
                                await authService.verify2FA(twoFactorCode);
                                const me = await authService.me();
                                setUser(me.data);
                                setTwoFactorSetup(null);
                                setTwoFactorCode('');
                                setSecuritySuccess('Two-factor authentication enabled');
                              } catch (err) {
                                setError(getApiErrorMessage(err, 'Invalid verification code'));
                              } finally {
                                setTwoFactorLoading(false);
                              }
                            }}
                            className="bg-emerald-500 text-white px-6 py-2.5 rounded-xl font-bold"
                          >
                            Verify & Enable
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}

              {securitySubTab === 'sessions' && (
                <div className="space-y-4">
                  <div>
                    <h3 className="text-xl font-bold text-white mb-1">Active Sessions</h3>
                    <p className="text-sm text-slate-400">Devices where you are currently signed in.</p>
                  </div>

                  <div className="space-y-2">
                    {sessions.map((s) => (
                      <div key={s.id} className="flex items-center justify-between p-3 rounded-xl bg-white/5">
                        <div>
                          <p className="text-white text-sm">{s.device_info || 'Unknown device'}</p>
                          <p className="text-xs text-slate-500">{s.ip_address} · {new Date(s.created_at).toLocaleString()}</p>
                        </div>
                        <button
                          onClick={async () => {
                            await authService.revokeSession(s.id);
                            const r = await authService.getSessions();
                            setSessions(r.data ?? []);
                          }}
                          className="text-xs text-rose-400 hover:underline"
                        >
                          Revoke
                        </button>
                      </div>
                    ))}
                    {sessions.length === 0 && <p className="text-slate-500 text-sm">No active sessions.</p>}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'billing' && (
            <div className="space-y-6 max-w-2xl">
              <div>
                <h3 className="text-xl font-bold text-white mb-1 flex items-center gap-2">
                  <CreditCard size={22} className="text-primary-400" />
                  Billing & Plans
                </h3>
                <p className="text-sm text-slate-400">View your current plan and manage subscription.</p>
              </div>

              <div className="p-6 rounded-2xl bg-white/5 border border-white/10 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Current Plan</p>
                    <p className="text-2xl font-bold text-white mt-1">{user?.plan?.name ?? 'Free'}</p>
                  </div>
                  <span className="text-xs font-bold uppercase tracking-wider text-primary-400 bg-primary-500/10 px-3 py-1.5 rounded-full">
                    {user?.plan?.slug ?? 'free'}
                  </span>
                </div>

                {billingLoading ? (
                  <div className="flex items-center gap-2 text-slate-400 text-sm">
                    <Loader2 size={16} className="animate-spin" />
                    Loading subscription...
                  </div>
                ) : subscription ? (
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-slate-500">Status</p>
                      <p className="text-white font-semibold capitalize">{subscription.status}</p>
                    </div>
                    <div>
                      <p className="text-slate-500">Billing Cycle</p>
                      <p className="text-white font-semibold capitalize">{subscription.billing_cycle}</p>
                    </div>
                    <div>
                      <p className="text-slate-500">Amount</p>
                      <p className="text-white font-semibold">${subscription.amount}</p>
                    </div>
                    <div>
                      <p className="text-slate-500">Renews</p>
                      <p className="text-white font-semibold">
                        {formatApiDate(subscription.current_period_end)}
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-slate-400">No active paid subscription. You are on the Free plan.</p>
                )}

                {user?.features && (
                  <div className="pt-4 border-t border-white/10">
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Plan Features</p>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(user.features).map(([key, value]) => (
                        <span key={key} className="text-xs px-2 py-1 rounded-lg bg-white/5 text-slate-300 border border-white/10">
                          {key.replace(/_/g, ' ')}: {String(value)}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {canManageBilling && (
                <Link
                  to="/billing"
                  className="inline-flex items-center gap-2 bg-ai-gradient text-white px-8 py-3 rounded-2xl font-bold shadow-ai"
                >
                  Manage Billing
                  <ExternalLink size={18} />
                </Link>
              )}
            </div>
          )}

          {activeTab === 'productivity-rules' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h3 className="text-xl font-bold text-white mb-1">Productivity Rules</h3>
                  <p className="text-sm text-slate-400">Classify apps, URLs, and keywords for productivity scoring.</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={async () => {
                      setRecategorizing(true);
                      try {
                        const res = await activityRecategorizeService.recategorize();
                        setShowSuccess(true);
                        setTimeout(() => setShowSuccess(false), 4000);
                        // eslint-disable-next-line no-console
                        console.info('[Recategorize]', res.message);
                      } catch {
                        setError('Recategorization failed. Try again.');
                      } finally {
                        setRecategorizing(false);
                      }
                    }}
                    disabled={recategorizing}
                    title="Re-apply current rules to all existing activity logs"
                    className="flex items-center gap-2 rounded-xl border border-sky-500/30 bg-sky-500/10 px-4 py-2.5 text-sm font-semibold text-sky-300 transition-colors hover:bg-sky-500/20 disabled:opacity-50"
                  >
                    {recategorizing ? <RefreshCw size={15} className="animate-spin" /> : <RefreshCw size={15} />}
                    Re-apply rules
                  </button>
                  <button
                    onClick={() => openRuleModal()}
                    className="flex items-center gap-2 bg-ai-gradient text-white px-5 py-2.5 rounded-xl font-bold shadow-ai"
                  >
                    <Plus size={18} /> Add rule
                  </button>
                </div>
              </div>

              {rulesLoading ? (
                <div className="flex justify-center py-12"><Loader2 className="animate-spin text-primary-500" /></div>
              ) : (
                <div className="overflow-x-auto rounded-2xl border border-white/10">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-white/5 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                        <th className="px-4 py-3">Type</th>
                        <th className="px-4 py-3">Pattern</th>
                        <th className="px-4 py-3">Category</th>
                        <th className="px-4 py-3">Active</th>
                        <th className="px-4 py-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {productivityRules.map((rule) => (
                        <tr key={rule.id} className="hover:bg-white/[0.02]">
                          <td className="px-4 py-3 text-sm text-slate-300">{rule.rule_type}</td>
                          <td className="px-4 py-3 text-sm text-white font-medium">{rule.pattern}</td>
                          <td className="px-4 py-3 text-sm capitalize text-primary-400">{rule.category}</td>
                          <td className="px-4 py-3 text-sm text-slate-400">{rule.is_active ? 'Yes' : 'No'}</td>
                          <td className="px-4 py-3 text-right">
                            <button onClick={() => openRuleModal(rule)} className="text-xs text-primary-400 hover:underline mr-3">Edit</button>
                            <button onClick={() => handleDeleteRule(rule.id)} className="text-xs text-rose-400 hover:underline">Delete</button>
                          </td>
                        </tr>
                      ))}
                      {productivityRules.length === 0 && (
                        <tr><td colSpan={5} className="px-4 py-12 text-center text-slate-500 text-sm">No rules yet.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {activeTab === 'activity-tracking' && user?.organization_id && (
            <ActivityTrackingSettingsTab organizationId={user.organization_id} />
          )}

          {activeTab === 'timesheet-policies' && user?.organization_id && (
            <TimesheetPolicySettingsTab organizationId={user.organization_id} />
          )}

          {activeTab === 'smart-notifications' && (
            <SmartNotificationsSettingsTab />
          )}

          {activeTab === 'office-locations' && user?.organization_id && (
            <OfficeLocationsSettingsTab organizationId={user.organization_id} />
          )}


          {activeTab === 'developer' && <DeveloperSettings />}

          {activeTab === 'roles-permissions' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-xl font-bold text-white mb-1">Roles & Permissions</h3>
                <p className="text-sm text-slate-400">Permission matrix for custom roles. System roles cannot be edited.</p>
              </div>

              <div className="flex gap-3">
                <input
                  value={newRoleName}
                  onChange={(e) => setNewRoleName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleCreateRole()}
                  placeholder="New custom role name"
                  className={inputClass}
                />
                <button onClick={handleCreateRole} disabled={isSaving || !newRoleName.trim()} className="flex items-center gap-2 bg-ai-gradient text-white px-6 py-3 rounded-xl font-bold disabled:opacity-50">
                  <Plus size={18} /> Create role
                </button>
              </div>

              {rolesLoading ? (
                <div className="flex justify-center py-12"><Loader2 className="animate-spin text-primary-500" /></div>
              ) : (
                <div className="overflow-x-auto rounded-2xl border border-white/10">
                  <table className="w-full text-left min-w-[640px]">
                    <thead>
                      <tr className="border-b border-white/5 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                        <th className="px-4 py-3 sticky left-0 bg-[#12141C]">Permission</th>
                        {roles.map((role) => (
                          <th key={role.id} className="px-4 py-3 text-center min-w-[110px]">
                            <div className="flex flex-col items-center gap-1">
                              <span>{role.name}</span>
                              {isCustomRole(role) ? (
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[9px] text-primary-400 normal-case">custom</span>
                                  <button type="button" onClick={() => handleRenameRole(role)} className="text-slate-400 hover:text-white" title="Rename role">
                                    <Pencil size={11} />
                                  </button>
                                  <button type="button" onClick={() => handleDeleteRole(role)} className="text-slate-400 hover:text-rose-400" title="Delete role">
                                    <Trash2 size={11} />
                                  </button>
                                </div>
                              ) : (
                                <span className="block text-[9px] text-slate-600 normal-case">system</span>
                              )}
                            </div>
                          </th>
                        ))}
                      </tr>
                      {/* Select All row — only shows when at least one custom role exists */}
                      {roles.some(isCustomRole) && (
                        <tr className="border-b border-white/10 bg-white/[0.03]">
                          <td className="px-4 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest sticky left-0 bg-[#12141C]">
                            Select all
                          </td>
                          {roles.map((role) => {
                            if (!isCustomRole(role)) {
                              return <td key={role.id} className="px-4 py-2 text-center" />;
                            }
                            const allPermIds = allPermissions.map((p) => p.id);
                            const current = rolePermissionIds[role.id] ?? [];
                            const allChecked = allPermIds.length > 0 && allPermIds.every((id) => current.includes(id));
                            const someChecked = !allChecked && allPermIds.some((id) => current.includes(id));
                            return (
                              <td key={role.id} className="px-4 py-2 text-center">
                                <input
                                  type="checkbox"
                                  title={allChecked ? 'Deselect all' : 'Select all permissions'}
                                  checked={allChecked}
                                  ref={(el) => { if (el) el.indeterminate = someChecked; }}
                                  disabled={savingRoleId === role.id}
                                  onChange={() => handleSelectAllForRole(role)}
                                  className="rounded border-white/20 disabled:opacity-40 accent-indigo-500 w-4 h-4"
                                />
                              </td>
                            );
                          })}
                        </tr>
                      )}
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {allPermissions.map((perm) => (
                        <tr key={perm.id} className="hover:bg-white/[0.02]">
                          <td className="px-4 py-2 text-xs text-slate-300 sticky left-0 bg-[#12141C]">
                            <span className="font-medium text-white">{perm.name}</span>
                            <span className="block text-[10px] text-slate-500">{perm.slug}</span>
                          </td>
                          {roles.map((role) => {
                            const checked = (rolePermissionIds[role.id] ?? []).includes(perm.id);
                            return (
                              <td key={role.id} className="px-4 py-2 text-center">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  disabled={!isCustomRole(role) || savingRoleId === role.id}
                                  onChange={() => toggleRolePermission(role.id, perm.id, role)}
                                  className="rounded border-white/20 disabled:opacity-40 accent-indigo-500"
                                />
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Rename role modal */}
              <Modal open={!!renameModal} onClose={() => setRenameModal(null)} title="Rename role" size="sm">
                {renameModal && (
                  <div className="space-y-4">
                    <input
                      autoFocus
                      value={renameModal.name}
                      onChange={(e) => setRenameModal((prev) => prev ? { ...prev, name: e.target.value } : null)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleRenameSubmit(); if (e.key === 'Escape') setRenameModal(null); }}
                      className="form-field"
                      placeholder="Role name"
                    />
                    <div className="flex justify-end gap-3 pt-1">
                      <button type="button" onClick={() => setRenameModal(null)} className="px-4 py-2 rounded-xl text-sm text-slate-400 hover:text-white bg-white/5 hover:bg-white/10 transition-colors">
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleRenameSubmit}
                        disabled={isSaving || !renameModal.name.trim()}
                        className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-bold bg-ai-gradient text-white disabled:opacity-50"
                      >
                        {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Pencil size={14} />}
                        Rename
                      </button>
                    </div>
                  </div>
                )}
              </Modal>
            </div>
          )}

          {activeTab === 'notifications' && (
            <div className="space-y-6 max-w-2xl">
              <div>
                <h3 className="text-xl font-bold text-white mb-1">Notification Preferences</h3>
                <p className="text-sm text-slate-400">Choose which events trigger email and in-app notifications.</p>
              </div>

              {prefsLoading ? (
                <div className="flex justify-center py-12"><Loader2 className="animate-spin text-primary-500" /></div>
              ) : (
                <div className="space-y-3">
                  {notificationPrefs.map((pref) => (
                    <div key={pref.event_key} className="flex items-center justify-between gap-4 p-4 rounded-2xl bg-white/5 border border-white/10">
                      <div>
                        <p className="font-medium text-white">{pref.label}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{pref.event_key}</p>
                      </div>
                      <div className="flex items-center gap-6">
                        <label className="flex items-center gap-2 text-sm text-slate-300">
                          <input
                            type="checkbox"
                            checked={pref.in_app_enabled}
                            onChange={() => toggleNotificationPref(pref.event_key, 'in_app_enabled')}
                          />
                          In-app
                        </label>
                        <label className="flex items-center gap-2 text-sm text-slate-300">
                          <input
                            type="checkbox"
                            checked={pref.email_enabled}
                            onChange={() => toggleNotificationPref(pref.event_key, 'email_enabled')}
                          />
                          Email
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="pt-2 flex justify-end">
                <button onClick={handleSaveNotificationPrefs} disabled={prefsSaving} className="flex items-center gap-2 bg-ai-gradient text-white px-10 py-3 rounded-2xl font-bold shadow-ai disabled:opacity-50">
                  {prefsSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save size={20} />}
                  Save preferences
                </button>
              </div>

              {canEditOrg && (
                <div className="pt-8 border-t border-white/10 space-y-4">
                  <h4 className="text-lg font-bold text-white">Scheduled Reports</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <select value={reportForm.report_type} onChange={(e) => setReportForm((p) => ({ ...p, report_type: e.target.value }))} className="form-select">
                      <option value="time_summary">Time Summary</option>
                      <option value="project_breakdown">Project Breakdown</option>
                      <option value="team_leaderboard">Team Leaderboard</option>
                    </select>
                    <select value={reportForm.cadence} onChange={(e) => setReportForm((p) => ({ ...p, cadence: e.target.value as ScheduledReport['cadence'] }))} className="form-select">
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly</option>
                      <option value="monthly">Monthly</option>
                    </select>
                    <select value={reportForm.format} onChange={(e) => setReportForm((p) => ({ ...p, format: e.target.value as ScheduledReport['format'] }))} className="form-select">
                      <option value="csv">CSV</option>
                      <option value="pdf">PDF</option>
                      <option value="xlsx">Excel</option>
                    </select>
                    <input value={reportForm.recipients} onChange={(e) => setReportForm((p) => ({ ...p, recipients: e.target.value }))} placeholder="emails@company.com, ..." className={inputClass} />
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await scheduledReportService.create({
                          report_type: reportForm.report_type,
                          cadence: reportForm.cadence,
                          format: reportForm.format,
                          recipients: reportForm.recipients.split(',').map((e) => e.trim()).filter(Boolean),
                          is_active: true,
                        });
                        const r = await scheduledReportService.getAll();
                        setScheduledReports(r.data ?? []);
                      } catch (err) {
                        setError(getApiErrorMessage(err, 'Failed to create scheduled report'));
                      }
                    }}
                    className="bg-primary-500 text-white px-6 py-2.5 rounded-xl font-bold"
                  >
                    Add Scheduled Report
                  </button>
                  <div className="space-y-2">
                    {scheduledReports.map((sr) => (
                      <div key={sr.id} className="flex items-center justify-between p-3 rounded-xl bg-white/5">
                        <div>
                          <p className="text-white text-sm">{sr.report_type.replace(/_/g, ' ')} · {sr.cadence} · {sr.format}</p>
                          <p className="text-xs text-slate-500">{sr.recipients.join(', ')}</p>
                        </div>
                        <button onClick={async () => { await scheduledReportService.delete(sr.id); const r = await scheduledReportService.getAll(); setScheduledReports(r.data ?? []); }} className="text-rose-400 text-xs">Delete</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <Modal
        open={showRuleModal}
        onClose={() => setShowRuleModal(false)}
        title={editingRule ? 'Edit rule' : 'New rule'}
        size="sm"
      >
        <form onSubmit={handleSaveRule} className="space-y-4">
          <select value={ruleForm.rule_type} onChange={(e) => setRuleForm((f) => ({ ...f, rule_type: e.target.value as ProductivityRule['rule_type'] }))} className="form-select w-full">
            <option value="app">App</option>
            <option value="url">URL</option>
            <option value="keyword">Keyword</option>
          </select>
          <input value={ruleForm.pattern} onChange={(e) => setRuleForm((f) => ({ ...f, pattern: e.target.value }))} placeholder="Pattern" required className={inputClass} />
          <select value={ruleForm.category} onChange={(e) => setRuleForm((f) => ({ ...f, category: e.target.value as ProductivityRule['category'] }))} className="form-select w-full">
            <option value="productive">Productive</option>
            <option value="unproductive">Unproductive</option>
            <option value="neutral">Neutral</option>
          </select>
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input type="checkbox" checked={ruleForm.is_active} onChange={(e) => setRuleForm((f) => ({ ...f, is_active: e.target.checked }))} />
            Active
          </label>
          <button type="submit" disabled={isSaving} className="w-full flex items-center justify-center gap-2 bg-ai-gradient text-white py-3 rounded-xl font-bold disabled:opacity-50">
            {isSaving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
            Save rule
          </button>
        </form>
      </Modal>
    </div>
  );
};

export default SettingsPage;
