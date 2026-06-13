import { useState, useEffect, useCallback, useRef } from 'react';
import { User, Building, Bell, Shield, Cloud, Save, Camera, Loader2, CheckCircle2, Lock, CreditCard, ExternalLink } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { motion, AnimatePresence } from 'framer-motion';
import client from '../../api/client';
import { organizationService } from '../../api/organizationService';
import { locationService } from '../../api/locationService';
import { hasPermission } from '../../utils/access';
import { getApiErrorMessage } from '../../utils/apiError';
import { authService } from '../../api/authService';
import { userService } from '../../api/userService';
import { billingService } from '../../api/billingService';
import { Link } from 'react-router-dom';
import type { Country, State, City, TimezoneOption } from '../../types';

const SettingsPage = () => {
  const { user, setUser } = useAuthStore();
  const [activeTab, setActiveTab] = useState('profile');
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
  });

  const [countries, setCountries] = useState<Country[]>([]);
  const [states, setStates] = useState<State[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [timezones, setTimezones] = useState<TimezoneOption[]>([]);
  const [citySearch, setCitySearch] = useState('');
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
  const canManageBilling = hasPermission(user, 'settings.billing');

  const tabs = [
    { id: 'profile', label: 'Profile Settings', icon: User },
    { id: 'organization', label: 'Organization', icon: Building },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'security', label: 'Security', icon: Shield },
    { id: 'billing', label: 'Billing & Plans', icon: Cloud },
  ];

  const loadOrg = useCallback(async () => {
    if (!user?.organization_id) return;
    try {
      const resp = await organizationService.get(user.organization_id);
      const org = resp.data;
      setOrgForm({
        name: org.name,
        country_id: org.country_id ?? '',
        state_id: org.state_id ?? '',
        city_id: org.city_id ?? '',
        timezone_id: org.timezone_id ?? '',
      });
      if (org.country_id) {
        const statesResp = await locationService.getStates(org.country_id);
        setStates(statesResp.data);
      }
      if (org.state_id) {
        const citiesResp = await locationService.searchCities(org.state_id);
        setCities(citiesResp.data);
      }
    } catch (e) {
      console.error(e);
    }
  }, [user?.organization_id]);

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
      return;
    }
    const timer = setTimeout(() => {
      locationService.searchCities(Number(orgForm.state_id), citySearch || undefined)
        .then((r) => setCities(r.data))
        .catch(() => undefined);
    }, 300);
    return () => clearTimeout(timer);
  }, [orgForm.state_id, citySearch]);

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
    if (activeTab !== 'billing') return;
    setBillingLoading(true);
    billingService.getSubscription()
      .then((r) => setSubscription(r.data))
      .catch(() => setSubscription(null))
      .finally(() => setBillingLoading(false));
  }, [activeTab]);

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
      };
      const resp = await organizationService.update(user.organization_id, payload);
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
                  <select
                    value={orgForm.country_id}
                    onChange={(e) => setOrgForm((p) => ({ ...p, country_id: e.target.value, state_id: '', city_id: '' }))}
                    disabled={!canEditOrg}
                    className="form-select"
                  >
                    <option value="">Select country</option>
                    {countries.map((c) => (
                      <option key={c.id} value={c.id}>{c.emoji ? `${c.emoji} ` : ''}{c.name}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-400 uppercase tracking-wider ml-1">State / Province</label>
                  <select
                    value={orgForm.state_id}
                    onChange={(e) => setOrgForm((p) => ({ ...p, state_id: e.target.value, city_id: '' }))}
                    disabled={!canEditOrg || !orgForm.country_id}
                    className="form-select"
                  >
                    <option value="">Select state</option>
                    {states.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-bold text-slate-400 uppercase tracking-wider ml-1">City</label>
                  <input
                    type="text"
                    placeholder="Search city..."
                    value={citySearch}
                    onChange={(e) => setCitySearch(e.target.value)}
                    disabled={!canEditOrg || !orgForm.state_id}
                    className={`${inputClass} mb-2`}
                  />
                  <select
                    value={orgForm.city_id}
                    onChange={(e) => setOrgForm((p) => ({ ...p, city_id: e.target.value }))}
                    disabled={!canEditOrg || !orgForm.state_id}
                    className="form-select"
                  >
                    <option value="">Select city</option>
                    {cities.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-bold text-slate-400 uppercase tracking-wider ml-1">Timezone</label>
                  <select
                    value={orgForm.timezone_id}
                    onChange={(e) => setOrgForm((p) => ({ ...p, timezone_id: e.target.value }))}
                    disabled={!canEditOrg}
                    className="form-select"
                  >
                    <option value="">Select timezone</option>
                    {timezones.map((tz) => (
                      <option key={tz.id} value={tz.id}>{tz.zone_group} — {tz.timezone} ({tz.php_timezone})</option>
                    ))}
                  </select>
                  {user?.organization?.php_timezone && (
                    <p className="text-xs text-slate-500 ml-1">Current: {user.organization.php_timezone}</p>
                  )}
                </div>
              </div>

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
              <div>
                <h3 className="text-xl font-bold text-white mb-1 flex items-center gap-2">
                  <Lock size={22} className="text-primary-400" />
                  Security
                </h3>
                <p className="text-sm text-slate-400">Update your password to keep your account secure.</p>
              </div>

              {securitySuccess && (
                <p className="text-emerald-400 text-sm bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-3">
                  {securitySuccess}
                </p>
              )}

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
                        {new Date(subscription.current_period_end).toLocaleDateString()}
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

          {activeTab === 'notifications' && (
            <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
              <div className="p-4 rounded-3xl bg-primary-500/10 border border-primary-500/20 text-primary-400">
                <Bell size={40} />
              </div>
              <div>
                <h3 className="text-xl font-bold text-white mb-2">Notifications</h3>
                <p className="text-slate-400 max-w-sm">Notification preferences will be available in a future update.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;
