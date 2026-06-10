import { useState } from 'react';
import { User, Building, Bell, Shield, Cloud, Save, Camera, Loader2, CheckCircle2 } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { motion, AnimatePresence } from 'framer-motion';
import client from '../../api/client';

const SettingsPage = () => {
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState('profile');
  const [isSaving, setIsSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [profileForm, setProfileForm] = useState({
    first_name: user?.first_name ?? '',
    last_name: user?.last_name ?? '',
  });

  const tabs = [
    { id: 'profile', label: 'Profile Settings', icon: User },
    { id: 'organization', label: 'Organization', icon: Building },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'security', label: 'Security', icon: Shield },
    { id: 'billing', label: 'Billing & Plans', icon: Cloud },
  ];

  const handleSave = async () => {
    setIsSaving(true);
    await client.put(`/users/${user?.id}`, profileForm);
    setIsSaving(false);
    setShowSuccess(true);
    setTimeout(() => setShowSuccess(false), 3000);
  };

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

      <div className="flex flex-col lg:flex-row gap-8">
        {/* Sidebar Tabs */}
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

        {/* Content Area */}
        <div className="flex-1 glass border border-white/5 rounded-3xl p-8 shadow-ai">
          {activeTab === 'profile' && (
            <div className="space-y-8 max-w-2xl">
              <div className="flex items-center gap-6">
                <div className="relative group">
                  <div className="w-24 h-24 rounded-3xl bg-ai-gradient flex items-center justify-center text-3xl font-bold text-white shadow-ai transition-transform group-hover:scale-105">
                    {user?.first_name?.[0]}{user?.last_name?.[0]}
                  </div>
                  <button className="absolute -bottom-2 -right-2 p-2 bg-primary-500 text-white rounded-xl shadow-lg border-2 border-[#12141C] hover:scale-110 transition-transform">
                    <Camera size={16} />
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
                    className="w-full h-12 bg-white/5 border border-white/10 rounded-xl px-4 text-white focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500/50 outline-none transition-all placeholder:text-slate-600"
                    placeholder="Enter first name"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-400 uppercase tracking-wider ml-1">Last Name</label>
                  <input 
                    type="text" 
                    value={profileForm.last_name}
                    onChange={(e) => setProfileForm((prev) => ({ ...prev, last_name: e.target.value }))}
                    className="w-full h-12 bg-white/5 border border-white/10 rounded-xl px-4 text-white focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500/50 outline-none transition-all placeholder:text-slate-600"
                    placeholder="Enter last name"
                  />
                </div>
                <div className="md:col-span-2 space-y-2">
                  <label className="text-sm font-bold text-slate-400 uppercase tracking-wider ml-1">Email Address</label>
                  <input 
                    type="email" 
                    readOnly
                    defaultValue={user?.email}
                    className="w-full h-12 bg-white/5 border border-white/10 rounded-xl px-4 text-slate-500 cursor-not-allowed outline-none"
                  />
                  <p className="text-[10px] text-slate-600 ml-1 italic font-medium">Email address is managed by your administrator.</p>
                </div>
              </div>

              <div className="pt-4 flex justify-end">
                <button 
                  onClick={handleSave}
                  disabled={isSaving}
                  className="flex items-center gap-2 bg-ai-gradient text-white px-10 py-3 rounded-2xl font-bold hover:scale-105 active:scale-95 transition-all shadow-ai disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSaving ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <Save size={20} />
                  )}
                  {isSaving ? 'Updating...' : 'Save Changes'}
                </button>
              </div>
            </div>
          )}

          {activeTab !== 'profile' && (
            <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
              <div className="p-4 rounded-3xl bg-primary-500/10 border border-primary-500/20 text-primary-400">
                <Cloud size={40} />
              </div>
              <div>
                <h3 className="text-xl font-bold text-white mb-2">{tabs.find(t => t.id === activeTab)?.label}</h3>
                <p className="text-slate-400 max-w-sm">This module is currently being optimized for your enterprise instance. Stay tuned for advanced controls.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;
