import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { UserPlus, Mail, Shield, Trash2, Search, Filter, X, Loader2, CheckCircle2, SlidersHorizontal } from 'lucide-react';
import { teamService, type TeamMember } from '../../api/teamService';
import { Button, Input } from '../../components/ui';
import { useAuthStore } from '../../store/authStore';
import { canManageTeam, canViewMemberTracking } from '../../utils/access';
import { Link } from 'react-router-dom';
import type { MemberMonitoringSettings } from '../../types';

const TeamPage = () => {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRole, setSelectedRole] = useState('all');
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [isInviting, setIsInviting] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('member');
  const [showSuccess, setShowSuccess] = useState(false);
  const [invitationLink, setInvitationLink] = useState('');
  const [showInvitationModal, setShowInvitationModal] = useState(false);
  const [monitorMember, setMonitorMember] = useState<TeamMember | null>(null);
  const [monitorSettings, setMonitorSettings] = useState<MemberMonitoringSettings | null>(null);
  const [savingMonitoring, setSavingMonitoring] = useState(false);
  const { user } = useAuthStore();
  const canManageTeamAccess = canManageTeam(user);

  useEffect(() => {
    fetchMembers();
  }, []);

  const fetchMembers = async () => {
    try {
      const resp = await teamService.getAll();
      setMembers(resp.data);
    } catch (e) {
      console.error(e);
      setMembers([]);
    } finally {
      setLoading(false);
    }
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsInviting(true);
    try {
      const resp = await teamService.invite(inviteEmail, inviteRole);
      setShowInviteModal(false);
      
      // Check if it was an invitation link
      if (resp.data && resp.data.invitation && resp.data.link) {
          setInvitationLink(resp.data.link);
          setShowInvitationModal(true);
      } else {
          setInviteEmail('');
          setShowSuccess(true);
          fetchMembers();
          setTimeout(() => setShowSuccess(false), 3000);
      }
    } catch (e) {
      console.error('Invite failed', e);
    } finally {
      setIsInviting(false);
    }
  };

  const copyToClipboard = () => {
      navigator.clipboard.writeText(invitationLink);
  };

  const openMonitoring = async (member: TeamMember) => {
    const memberUserId = member.user_id ?? member.id;
    try {
      const resp = await teamService.getMonitoring(memberUserId);
      setMonitorMember(member);
      setMonitorSettings(resp.data);
    } catch (e) {
      console.error('Failed to load monitoring settings', e);
    }
  };

  const saveMonitoring = async () => {
    if (!monitorMember || !monitorSettings) return;
    setSavingMonitoring(true);
    try {
      const memberUserId = monitorMember.user_id ?? monitorMember.id;
      await teamService.updateMonitoring(memberUserId, monitorSettings);
      setMonitorMember(null);
      setMonitorSettings(null);
      fetchMembers();
    } catch (e) {
      console.error('Failed to save monitoring settings', e);
    } finally {
      setSavingMonitoring(false);
    }
  };

  const monitoringStatus = (member: TeamMember) => {
    const tracking = member.tracking_enabled !== false;
    const screenshots = member.screenshots_enabled !== false;
    if (!tracking) return { label: 'Tracker off', className: 'text-rose-400 bg-rose-500/10 border-rose-500/20' };
    if (!screenshots) return { label: 'No screenshots', className: 'text-amber-400 bg-amber-500/10 border-amber-500/20' };
    return { label: 'Active', className: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' };
  };

  const filteredMembers = members.filter(m => {
    const matchesSearch = `${m.first_name} ${m.last_name}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         m.email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesRole = selectedRole === 'all' || m.role === selectedRole;
    return matchesSearch && matchesRole;
  });

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="w-10 h-10 text-primary-500 animate-spin" />
      </div>
    );
  }

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
            <span className="font-bold">Invitation sent successfully!</span>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Team Management</h1>
          <p className="text-slate-400">Manage your organization's members and their roles.</p>
        </div>
        {canManageTeamAccess && (
        <Button onClick={() => setShowInviteModal(true)} className="w-fit">
          <UserPlus size={20} className="mr-2" />
          Invite Member
        </Button>
        )}
      </div>

      {!canManageTeamAccess && (
        <div className="glass-card border border-amber-500/20 text-amber-300 p-4 rounded-2xl text-sm">
          You need administrator access to manage team monitoring settings.
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="lg:col-span-3 h-14 relative group">
          <div className="absolute inset-y-0 left-4 flex items-center text-slate-500 group-focus-within:text-primary-400">
            <Search size={20} />
          </div>
          <input 
            type="text" 
            placeholder="Search members by name or email..."
            className="w-full h-full bg-white/5 border border-white/10 rounded-2xl pl-12 pr-4 text-white focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500/50 outline-none transition-all placeholder:text-slate-600"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="relative group">
          <Shield className="absolute inset-y-0 left-4 flex items-center text-slate-500 group-focus-within:text-primary-400 pointer-events-none" size={20} />
          <select 
            className="appearance-none h-14 bg-white/5 border border-white/10 rounded-2xl pl-12 pr-10 text-white focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500/50 outline-none transition-all cursor-pointer font-medium w-full"
            value={selectedRole}
            onChange={(e) => setSelectedRole(e.target.value)}
          >
            <option value="all">All Roles</option>
            <option value="owner">Owner</option>
            <option value="admin">Administrator</option>
            <option value="manager">Manager</option>
            <option value="team_lead">Team Lead</option>
            <option value="member">Member</option>
          </select>
          <Filter className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" size={18} />
        </div>
      </div>

      <div className="glass rounded-3xl overflow-hidden border border-white/5 shadow-ai">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-white/5">
              <th className="px-6 py-4 text-sm font-bold text-slate-400 uppercase tracking-wider">Member</th>
              <th className="px-6 py-4 text-sm font-bold text-slate-400 uppercase tracking-wider">Role</th>
              <th className="px-6 py-4 text-sm font-bold text-slate-400 uppercase tracking-wider">Monitoring</th>
              <th className="px-6 py-4 text-sm font-bold text-slate-400 uppercase tracking-wider">Joined</th>
              <th className="px-6 py-4 text-sm font-bold text-slate-400 uppercase tracking-wider text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {filteredMembers.map((member) => (
              <tr key={member.id} className="hover:bg-white/[0.02] transition-colors group">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-ai-gradient flex items-center justify-center text-white font-bold ring-2 ring-white/10 transition-transform group-hover:scale-110">
                      {member.first_name[0]}{member.last_name[0]}
                    </div>
                    <div>
                      <div className="font-semibold text-white group-hover:text-primary-400 transition-colors uppercase tracking-tight">{member.first_name} {member.last_name}</div>
                      <div className="text-xs text-slate-500 flex items-center gap-1">
                        <Mail size={12} />
                        {member.email}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                    member.role === 'owner' ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20' :
                    member.role === 'admin' ? 'bg-primary-500/10 text-primary-400 border border-primary-500/20' :
                    'bg-slate-500/10 text-slate-400 border border-slate-500/20'
                  }`}>
                    <Shield size={12} />
                    {member.role}
                  </span>
                </td>
                <td className="px-6 py-4">
                  {(() => {
                    const status = monitoringStatus(member);
                    return (
                      <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider border ${status.className}`}>
                        {status.label}
                      </span>
                    );
                  })()}
                </td>
                <td className="px-6 py-4 text-slate-400 text-sm font-medium">
                  {new Date(member.joined_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-all">
                    {canViewMemberTracking(user) && (
                      <Link
                        to={`/team/member/${member.user_id ?? member.id}`}
                        className="px-2 py-1 text-xs font-bold text-primary-400 hover:bg-primary-500/10 rounded-lg"
                      >
                        Tracking
                      </Link>
                    )}
                    {canManageTeamAccess && (
                      <button
                        className="p-2 rounded-lg text-slate-500 hover:text-primary-400 hover:bg-primary-500/10 transition-all"
                        title="Monitoring settings"
                        onClick={() => openMonitoring(member)}
                      >
                        <SlidersHorizontal size={18} />
                      </button>
                    )}
                    {canManageTeamAccess && (
                  <button 
                    className="p-2 rounded-lg text-slate-500 hover:text-accent hover:bg-accent/10 transition-all"
                    onClick={async () => {
                      if (!confirm(`Remove ${member.first_name} ${member.last_name} from the team?`)) return;
                      try {
                        await teamService.remove(member.user_id ?? member.id);
                        fetchMembers();
                      } catch (e) {
                        console.error('Remove failed', e);
                      }
                    }}
                  >
                    <Trash2 size={18} />
                  </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filteredMembers.length === 0 && (
          <div className="p-20 text-center text-slate-500 font-medium">
            <div className="w-16 h-16 bg-white/5 rounded-3xl flex items-center justify-center mx-auto mb-4">
              <Search size={32} />
            </div>
            No members found matching your search.
          </div>
        )}
      </div>

      {/* Invite Member Modal */}
      <AnimatePresence>
        {showInviteModal && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowInviteModal(false)}
              className="absolute inset-0 bg-black/80"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-lg modal-panel p-8 z-10"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-8">
                <h2 className="text-2xl font-bold text-white">Invite Team Member</h2>
                <button onClick={() => setShowInviteModal(false)} className="text-slate-500 hover:text-white">
                  <X size={24} />
                </button>
              </div>

              <form onSubmit={handleInvite} className="space-y-6">
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-400 uppercase tracking-wider ml-1">Email Address</label>
                  <Input 
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="e.g. colleague@company.com" 
                    required 
                  />
                </div>

                <div className="space-y-4">
                  <label className="text-sm font-bold text-slate-400 uppercase tracking-wider ml-1 flex items-center gap-2">
                    <Shield size={16} /> Assign Role
                  </label>
                  <div className="grid grid-cols-2 gap-4">
                    {['member', 'team_lead', 'manager', 'admin'].map((role) => (
                      <button
                        key={role}
                        type="button"
                        onClick={() => setInviteRole(role)}
                        className={`p-4 rounded-2xl border transition-all text-left ${inviteRole === role ? 'bg-primary-500/10 border-primary-500/50 text-white' : 'bg-white/5 border-white/10 text-slate-400 hover:bg-white/10'}`}
                      >
                        <div className="font-bold capitalize mb-1">{role.replace('_', ' ')}</div>
                        <div className="text-[10px] uppercase opacity-60">
                          {role === 'admin' ? 'Full org access' : role === 'manager' ? 'Team management' : role === 'team_lead' ? 'Team visibility' : 'Own tracking only'}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="pt-4 flex gap-4">
                  <Button variant="secondary" type="button" className="flex-1" onClick={() => setShowInviteModal(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" className="flex-1" isLoading={isInviting}>
                    Send Invitation
                  </Button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Invitation Link Modal */}
      <AnimatePresence>
        {showInvitationModal && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
             <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowInvitationModal(false)}
              className="absolute inset-0 bg-black/80"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-lg modal-panel p-8 z-10"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-8">
                <h2 className="text-2xl font-bold text-white">Invitation Created</h2>
                <button onClick={() => setShowInvitationModal(false)} className="text-slate-500 hover:text-white">
                  <X size={24} />
                </button>
              </div>

              <div className="space-y-6">
                <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 p-4 rounded-xl flex items-start gap-3">
                   <div className="mt-1"><CheckCircle2 size={18} /></div>
                   <div>
                       <p className="font-semibold">User Invited Successfully</p>
                       <p className="text-sm opacity-80 mt-1">
                           The user does not have an account yet. Share the link below with them to join your team.
                       </p>
                   </div>
                </div>

                <div className="space-y-2">
                   <label className="text-sm font-bold text-slate-400 uppercase tracking-wider">Invitation Link</label>
                   <div className="flex gap-2">
                       <Input 
                         readOnly 
                         value={invitationLink} 
                         className="bg-black/20"
                       />
                       <Button onClick={copyToClipboard}>
                           Copy
                       </Button>
                   </div>
                </div>

                 <div className="pt-4 flex justify-end">
                  <Button onClick={() => {
                      setShowInvitationModal(false);
                      setInviteEmail('');
                      fetchMembers();
                  }}>
                    Done
                  </Button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Member Monitoring Modal */}
      <AnimatePresence>
        {monitorMember && monitorSettings && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => { setMonitorMember(null); setMonitorSettings(null); }}
              className="absolute inset-0 bg-black/80"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-xl modal-panel p-8 max-h-[90vh] overflow-y-auto z-10"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-2xl font-bold text-white">Monitoring Controls</h2>
                  <p className="text-slate-400 text-sm mt-1">
                    {monitorMember.first_name} {monitorMember.last_name}
                  </p>
                </div>
                <button onClick={() => { setMonitorMember(null); setMonitorSettings(null); }} className="text-slate-500 hover:text-white">
                  <X size={24} />
                </button>
              </div>

              <div className="space-y-6">
                <label className="flex items-center justify-between p-4 rounded-2xl bg-white/5 border border-white/10 cursor-pointer">
                  <div>
                    <div className="font-semibold text-white">Time tracker</div>
                    <div className="text-xs text-slate-500">Allow this member to start/stop the timer</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={monitorSettings.tracking_enabled}
                    onChange={(e) => setMonitorSettings({ ...monitorSettings, tracking_enabled: e.target.checked })}
                    className="w-5 h-5 accent-primary-500"
                  />
                </label>

                <label className="flex items-center justify-between p-4 rounded-2xl bg-white/5 border border-white/10 cursor-pointer">
                  <div>
                    <div className="font-semibold text-white">Screenshots enabled</div>
                    <div className="text-xs text-slate-500">Master switch for screenshot capture</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={monitorSettings.screenshots_enabled}
                    onChange={(e) => setMonitorSettings({ ...monitorSettings, screenshots_enabled: e.target.checked })}
                    className="w-5 h-5 accent-primary-500"
                  />
                </label>

                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-400 uppercase tracking-wider">Disable screenshots until</label>
                  <Input
                    type="datetime-local"
                    value={monitorSettings.screenshot_disabled_until?.slice(0, 16) ?? ''}
                    onChange={(e) => setMonitorSettings({
                      ...monitorSettings,
                      screenshot_disabled_until: e.target.value ? new Date(e.target.value).toISOString() : null,
                    })}
                  />
                  <p className="text-xs text-slate-500">Screenshots stay off until this date/time passes.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-slate-400 uppercase tracking-wider">Pause from</label>
                    <Input
                      type="datetime-local"
                      value={monitorSettings.screenshot_disabled_from?.slice(0, 16) ?? ''}
                      onChange={(e) => setMonitorSettings({
                        ...monitorSettings,
                        screenshot_disabled_from: e.target.value ? new Date(e.target.value).toISOString() : null,
                      })}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-slate-400 uppercase tracking-wider">Pause until</label>
                    <Input
                      type="datetime-local"
                      value={monitorSettings.screenshot_disabled_to?.slice(0, 16) ?? ''}
                      onChange={(e) => setMonitorSettings({
                        ...monitorSettings,
                        screenshot_disabled_to: e.target.value ? new Date(e.target.value).toISOString() : null,
                      })}
                    />
                  </div>
                </div>
                <p className="text-xs text-slate-500">Use the window above to disable screenshots during a specific period (e.g. client meeting).</p>
              </div>

              <div className="pt-6 flex gap-4">
                <Button variant="secondary" type="button" className="flex-1" onClick={() => { setMonitorMember(null); setMonitorSettings(null); }}>
                  Cancel
                </Button>
                <Button type="button" className="flex-1" isLoading={savingMonitoring} onClick={saveMonitoring}>
                  Save Settings
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
};

export default TeamPage;
