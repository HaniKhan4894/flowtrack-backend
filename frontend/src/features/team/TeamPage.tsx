import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { UserPlus, Mail, Shield, Trash2, Search, Filter, Loader2, CheckCircle2, SlidersHorizontal, UsersRound, Target, Pencil, ShieldAlert, Info, ExternalLink } from 'lucide-react';
import { teamService, type TeamMember, type TeamGroup } from '../../api/teamService';
import type { AdvancedMonitoringStatus } from '../../api/advancedMonitoringService';
import { reportService } from '../../api/reportService';
import { billingService, type SubscriptionUsage } from '../../api/billingService';
import { Button, Input, Modal } from '../../components/ui';
import { useAuthStore } from '../../store/authStore';
import { canManageTeam, canViewMemberTracking, hasPermission } from '../../utils/access';
import { Link } from 'react-router-dom';
import type { MemberMonitoringSettings } from '../../types';
import axios from 'axios';

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
  const [advancedData, setAdvancedData] = useState<AdvancedMonitoringStatus | null>(null);
  const [advancedReason, setAdvancedReason] = useState('');
  const [advancedFrequency, setAdvancedFrequency] = useState(1);
  const [advancedNotify, setAdvancedNotify] = useState(false);
  const [closeSummary, setCloseSummary] = useState('');
  const [closeNotify, setCloseNotify] = useState(false);
  const [savingAdvanced, setSavingAdvanced] = useState(false);
  const [savingMonitoring, setSavingMonitoring] = useState(false);
  const [activeUserIds, setActiveUserIds] = useState<Set<number>>(new Set());
  const [teams, setTeams] = useState<TeamGroup[]>([]);
  const [showTeamModal, setShowTeamModal] = useState(false);
  const [editingTeam, setEditingTeam] = useState<TeamGroup | null>(null);
  const [teamForm, setTeamForm] = useState({ name: '', member_ids: [] as number[] });
  const [savingTeam, setSavingTeam] = useState(false);
  const [editingTarget, setEditingTarget] = useState<number | null>(null);
  const [targetValue, setTargetValue] = useState('');
  const [usage, setUsage] = useState<SubscriptionUsage | null>(null);
  const [inviteError, setInviteError] = useState('');
  const { user } = useAuthStore();
  const canManageTeamAccess = canManageTeam(user);
  const userLimit = usage?.users.limit;
  const slotsUsed = usage?.users.current ?? members.length;
  const atMemberLimit = typeof userLimit === 'number' && slotsUsed >= userLimit;

  useEffect(() => {
    fetchMembers();
    teamService.getTeams().then((r) => setTeams(r.data ?? [])).catch(() => setTeams([]));
    billingService.getUsage().then((r) => setUsage(r.data)).catch(() => setUsage(null));
  }, []);

  useEffect(() => {
    const poll = () => {
      reportService.getActiveSessions()
        .then((r) => setActiveUserIds(new Set((r.data ?? []).map((s) => s.user_id))))
        .catch(() => setActiveUserIds(new Set()));
    };
    poll();
    const interval = setInterval(poll, 30_000);
    return () => clearInterval(interval);
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
    setInviteError('');
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
          billingService.getUsage().then((r) => setUsage(r.data)).catch(() => setUsage(null));
          setTimeout(() => setShowSuccess(false), 3000);
      }
    } catch (e) {
      const message = axios.isAxiosError(e)
        ? (e.response?.data?.message || e.response?.data?.messages?.error || e.message)
        : 'Failed to send invitation';
      setInviteError(String(message));
    } finally {
      setIsInviting(false);
    }
  };

  const copyToClipboard = () => {
      navigator.clipboard.writeText(invitationLink);
  };

  const canManageAdvanced = hasPermission(user, 'monitoring.advanced');

  const openMonitoring = async (member: TeamMember) => {
    const memberUserId = member.user_id ?? member.id;
    try {
      const requests: Promise<unknown>[] = [teamService.getMonitoring(memberUserId)];
      if (canManageAdvanced) {
        requests.push(teamService.getAdvancedMonitoring(memberUserId));
      }
      const results = await Promise.all(requests);
      const monResp = results[0] as Awaited<ReturnType<typeof teamService.getMonitoring>>;
      setMonitorMember(member);
      setMonitorSettings(monResp.data);
      if (canManageAdvanced && results[1]) {
        const advResp = results[1] as Awaited<ReturnType<typeof teamService.getAdvancedMonitoring>>;
        setAdvancedData(advResp.data);
        setAdvancedFrequency(advResp.data.active?.screenshot_frequency_minutes ?? 1);
        setAdvancedReason('');
        setAdvancedNotify(false);
        setCloseSummary('');
        setCloseNotify(false);
      } else {
        setAdvancedData(null);
      }
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
    if (member.advanced_monitoring_active) {
      return { label: 'Advanced', className: 'text-rose-300 bg-rose-500/10 border-rose-500/30' };
    }
    const tracking = member.tracking_enabled !== false;
    const screenshots = member.screenshots_enabled !== false;
    if (!tracking) return { label: 'Tracker off', className: 'text-rose-400 bg-rose-500/10 border-rose-500/20' };
    if (!screenshots) return { label: 'No screenshots', className: 'text-amber-400 bg-amber-500/10 border-amber-500/20' };
    return { label: 'Active', className: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' };
  };

  const enableAdvancedMonitoring = async () => {
    if (!monitorMember) return;
    setSavingAdvanced(true);
    try {
      const memberUserId = monitorMember.user_id ?? monitorMember.id;
      await teamService.enableAdvancedMonitoring(memberUserId, {
        reason: advancedReason,
        screenshot_frequency_minutes: advancedFrequency,
        notify_member: advancedNotify,
      });
      const advResp = await teamService.getAdvancedMonitoring(memberUserId);
      setAdvancedData(advResp.data);
      fetchMembers();
    } catch (e) {
      console.error('Failed to enable advanced monitoring', e);
      alert('Could not enable advanced monitoring. Check plan and permissions.');
    } finally {
      setSavingAdvanced(false);
    }
  };

  const closeAdvancedMonitoring = async () => {
    if (!monitorMember) return;
    setSavingAdvanced(true);
    try {
      const memberUserId = monitorMember.user_id ?? monitorMember.id;
      await teamService.closeAdvancedMonitoring(memberUserId, {
        result_summary: closeSummary,
        notify_member: closeNotify,
      });
      const advResp = await teamService.getAdvancedMonitoring(memberUserId);
      setAdvancedData(advResp.data);
      fetchMembers();
    } catch (e) {
      console.error('Failed to close advanced monitoring', e);
    } finally {
      setSavingAdvanced(false);
    }
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
          <p className="text-slate-400">
            Manage your organization's members and their roles.
            {typeof userLimit === 'number' && (
              <span className="block mt-1 text-slate-500">
                Plan limit: {slotsUsed} / {userLimit} members
                {(usage?.users.pending_invites ?? 0) > 0 ? ` (includes ${usage?.users.pending_invites} pending invite${usage?.users.pending_invites === 1 ? '' : 's'})` : ''}
              </span>
            )}
          </p>
        </div>
        {canManageTeamAccess && (
        <Button
          onClick={() => {
            setInviteError('');
            setShowInviteModal(true);
          }}
          className="w-fit"
          disabled={atMemberLimit}
        >
          <UserPlus size={20} className="mr-2" />
          {atMemberLimit ? 'Member Limit Reached' : 'Invite Member'}
        </Button>
        )}
      </div>

      {atMemberLimit && canManageTeamAccess && (
        <div className="glass-card border border-amber-500/20 text-amber-200 p-4 rounded-2xl text-sm flex items-start justify-between gap-4">
          <p>
            Your plan allows up to {userLimit} team members. Remove a member or{' '}
            <Link to="/billing" className="font-semibold text-amber-100 hover:underline">upgrade your plan</Link>{' '}
            to invite more people.
          </p>
        </div>
      )}

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

      {canManageTeamAccess && (
        <div className="glass-card p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <UsersRound size={20} className="text-primary-400" /> Teams
            </h2>
            <Button size="sm" onClick={() => { setEditingTeam(null); setTeamForm({ name: '', member_ids: [] }); setShowTeamModal(true); }}>Create Team</Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {teams.map((team) => (
              <div key={team.id} className="p-4 rounded-2xl bg-white/5 border border-white/10">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-bold text-white">{team.name}</p>
                    <p className="text-xs text-slate-500 mt-1">{team.member_count} members</p>
                    {team.lead && <p className="text-xs text-primary-400 mt-2">Lead: {team.lead.first_name} {team.lead.last_name}</p>}
                  </div>
                  {canManageTeamAccess && (
                    <div className="flex gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingTeam(team);
                          setTeamForm({
                            name: team.name,
                            member_ids: team.members.map((m) => m.user_id),
                          });
                          setShowTeamModal(true);
                        }}
                        className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/10"
                        title="Edit team"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          if (!window.confirm(`Delete team "${team.name}"?`)) return;
                          try {
                            await teamService.deleteTeam(team.id);
                            const r = await teamService.getTeams();
                            setTeams(r.data ?? []);
                          } catch (e) {
                            console.error(e);
                          }
                        }}
                        className="p-2 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10"
                        title="Delete team"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {teams.length === 0 && <p className="text-slate-500 text-sm col-span-full">No teams created yet.</p>}
          </div>
        </div>
      )}

      <div className="glass rounded-3xl overflow-hidden border border-white/5 shadow-ai">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-white/5">
              <th className="px-6 py-4 text-sm font-bold text-slate-400 uppercase tracking-wider">Member</th>
              <th className="px-6 py-4 text-sm font-bold text-slate-400 uppercase tracking-wider">Role</th>
              <th className="px-6 py-4 text-sm font-bold text-slate-400 uppercase tracking-wider">Monitoring</th>
              <th className="px-6 py-4 text-sm font-bold text-slate-400 uppercase tracking-wider">Daily Target</th>
              <th className="px-6 py-4 text-sm font-bold text-slate-400 uppercase tracking-wider">Joined</th>
              <th className="px-6 py-4 text-sm font-bold text-slate-400 uppercase tracking-wider text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {filteredMembers.map((member) => (
              <tr key={member.id} className="hover:bg-white/[0.02] transition-colors group">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <div className="w-10 h-10 rounded-xl bg-ai-gradient flex items-center justify-center text-white font-bold ring-2 ring-white/10 transition-transform group-hover:scale-110">
                        {member.first_name[0]}{member.last_name[0]}
                      </div>
                      <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-surface-900 ${activeUserIds.has(member.user_id ?? member.id) ? 'bg-emerald-400' : 'bg-slate-600'}`} title={activeUserIds.has(member.user_id ?? member.id) ? 'Working now' : 'Offline'} />
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
                <td className="px-6 py-4">
                  {canManageTeamAccess && editingTarget === (member.user_id ?? member.id) ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        step="0.5"
                        value={targetValue}
                        onChange={(e) => setTargetValue(e.target.value)}
                        className="w-16 h-8 bg-white/5 border border-white/10 rounded-lg px-2 text-white text-sm"
                      />
                      <button
                        className="text-xs text-primary-400"
                        onClick={async () => {
                          await teamService.updateMember(member.user_id ?? member.id, {
                            daily_hours_target: targetValue ? parseFloat(targetValue) : null,
                          });
                          setEditingTarget(null);
                          fetchMembers();
                        }}
                      >
                        Save
                      </button>
                    </div>
                  ) : (
                    <button
                      className="text-sm text-slate-300 flex items-center gap-1"
                      onClick={() => {
                        if (!canManageTeamAccess) return;
                        setEditingTarget(member.user_id ?? member.id);
                        setTargetValue(member.daily_hours_target != null ? String(member.daily_hours_target) : '');
                      }}
                    >
                      <Target size={14} className="text-primary-400" />
                      {member.daily_hours_target != null ? `${member.daily_hours_target}h` : '—'}
                    </button>
                  )}
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
      <Modal open={showInviteModal} onClose={() => setShowInviteModal(false)} title="Invite Team Member">
        <form onSubmit={handleInvite} className="space-y-6">
          {inviteError && (
            <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
              {inviteError}
            </div>
          )}
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
      </Modal>

      {/* Invitation Link Modal */}
      <Modal open={showInvitationModal} onClose={() => setShowInvitationModal(false)} title="Invitation Created">
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
      </Modal>

      {/* Member Monitoring Modal */}
      <Modal
        open={!!(monitorMember && monitorSettings)}
        onClose={() => { setMonitorMember(null); setMonitorSettings(null); }}
        title="Monitoring Controls"
        size="lg"
      >
        {monitorMember && monitorSettings && (
          <>
            <p className="text-slate-400 text-sm -mt-2 mb-6">
              {monitorMember.first_name} {monitorMember.last_name}
            </p>

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

              {canManageAdvanced && advancedData && (
                <div className="rounded-2xl border border-rose-500/20 bg-rose-500/5 p-5 space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-bold text-white flex items-center gap-2">
                        <ShieldAlert size={18} className="text-rose-400" />
                        Advanced Monitoring
                      </h3>
                      <p className="text-xs text-slate-400 mt-1 flex items-start gap-1">
                        <Info size={12} className="mt-0.5 shrink-0" />
                        Intensifies screenshot capture and activity tracking for suspicious or low-activity members. Use when you need deeper visibility before taking action.
                      </p>
                    </div>
                    {advancedData.active && (
                      <Link
                        to={`/team/member/${monitorMember.user_id ?? monitorMember.id}/advanced-monitoring`}
                        className="text-xs font-bold text-primary-400 hover:underline flex items-center gap-1 shrink-0"
                      >
                        View report <ExternalLink size={12} />
                      </Link>
                    )}
                  </div>

                  {!advancedData.plan_available ? (
                    <p className="text-sm text-amber-300">Upgrade to Professional or Enterprise to use advanced monitoring.</p>
                  ) : advancedData.active ? (
                    <div className="space-y-4">
                      <div className="rounded-xl bg-black/20 border border-rose-500/20 p-4 text-sm text-rose-100">
                        Active since {new Date(advancedData.active.started_at).toLocaleString()}
                        {advancedData.active.reason ? ` · ${advancedData.active.reason}` : ''}
                        <div className="text-xs text-rose-200/70 mt-1">
                          Screenshot frequency: every {advancedData.active.screenshot_frequency_minutes} min (random within window)
                        </div>
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-bold text-slate-400 uppercase tracking-wider">Review result summary</label>
                        <textarea
                          value={closeSummary}
                          onChange={(e) => setCloseSummary(e.target.value)}
                          rows={3}
                          placeholder="Optional summary sent to the member if you notify them..."
                          className="w-full bg-surface-800 border border-white/10 rounded-xl px-4 py-3 text-white text-sm"
                        />
                      </div>
                      <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                        <input type="checkbox" checked={closeNotify} onChange={(e) => setCloseNotify(e.target.checked)} className="accent-primary-500" />
                        Notify member with result summary
                      </label>
                      <Button type="button" variant="secondary" className="w-full" isLoading={savingAdvanced} onClick={closeAdvancedMonitoring}>
                        End advanced monitoring
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <label className="text-sm font-bold text-slate-400 uppercase tracking-wider">Reason (internal note)</label>
                        <textarea
                          value={advancedReason}
                          onChange={(e) => setAdvancedReason(e.target.value)}
                          rows={2}
                          placeholder="e.g. Low productivity, suspicious idle patterns..."
                          className="w-full bg-surface-800 border border-white/10 rounded-xl px-4 py-3 text-white text-sm"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                          Screenshot frequency (minutes)
                          <span title="Captures at a random time within each interval so the member cannot predict when the next screenshot is taken." className="text-slate-500 cursor-help">
                            <Info size={14} />
                          </span>
                        </label>
                        <input
                          type="range"
                          min={1}
                          max={5}
                          value={advancedFrequency}
                          onChange={(e) => setAdvancedFrequency(Number(e.target.value))}
                          className="w-full accent-rose-500"
                        />
                        <span className="text-sm text-slate-300">{advancedFrequency} min · random capture within window</span>
                      </div>
                      <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                        <input type="checkbox" checked={advancedNotify} onChange={(e) => setAdvancedNotify(e.target.checked)} className="accent-primary-500" />
                        Notify member that advanced monitoring is enabled
                      </label>
                      <p className="text-[10px] text-slate-500">If checked, the member receives an in-app warning explaining that monitoring has been intensified.</p>
                      <Button type="button" className="w-full bg-rose-600 hover:bg-rose-500" isLoading={savingAdvanced} onClick={enableAdvancedMonitoring}>
                        Enable advanced monitoring
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="pt-6 flex gap-4">
              <Button variant="secondary" type="button" className="flex-1" onClick={() => { setMonitorMember(null); setMonitorSettings(null); }}>
                Cancel
              </Button>
              <Button type="button" className="flex-1" isLoading={savingMonitoring} onClick={saveMonitoring}>
                Save Settings
              </Button>
            </div>
          </>
        )}
      </Modal>

      <Modal
        open={showTeamModal}
        onClose={() => { setShowTeamModal(false); setEditingTeam(null); }}
        title={editingTeam ? 'Edit Team' : 'Create Team'}
      >
        <div className="space-y-4">
          <Input value={teamForm.name} onChange={(e) => setTeamForm((p) => ({ ...p, name: e.target.value }))} placeholder="Team name" required />
          <div className="space-y-2 max-h-48 overflow-y-auto">
            <p className="text-xs text-slate-500 uppercase font-bold">Assign members</p>
            {members.map((m) => {
              const id = m.user_id;
              if (!id) return null;
              const checked = teamForm.member_ids.includes(id);
              return (
                <label key={id} className="flex items-center gap-2 text-sm text-slate-300">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => setTeamForm((p) => ({
                      ...p,
                      member_ids: checked ? p.member_ids.filter((x) => x !== id) : [...p.member_ids, id],
                    }))}
                  />
                  {m.first_name} {m.last_name}
                </label>
              );
            })}
          </div>
          <Button
            isLoading={savingTeam}
            onClick={async () => {
              setSavingTeam(true);
              try {
                if (editingTeam) {
                  await teamService.updateTeam(editingTeam.id, { name: teamForm.name });
                  const currentIds = new Set(editingTeam.members.map((m) => m.user_id));
                  const nextIds = new Set(teamForm.member_ids);
                  for (const uid of teamForm.member_ids) {
                    if (!currentIds.has(uid)) {
                      await teamService.assignMembers(editingTeam.id, [uid]);
                    }
                  }
                  for (const uid of editingTeam.members.map((m) => m.user_id)) {
                    if (!nextIds.has(uid)) {
                      await teamService.removeTeamMember(editingTeam.id, uid);
                    }
                  }
                } else {
                  await teamService.createTeam({ name: teamForm.name, member_ids: teamForm.member_ids });
                }
                const r = await teamService.getTeams();
                setTeams(r.data ?? []);
                setShowTeamModal(false);
                setEditingTeam(null);
                setTeamForm({ name: '', member_ids: [] });
              } catch (e) {
                console.error(e);
              } finally {
                setSavingTeam(false);
              }
            }}
          >
            {editingTeam ? 'Save Team' : 'Create Team'}
          </Button>
        </div>
      </Modal>

    </div>
  );
};

export default TeamPage;
