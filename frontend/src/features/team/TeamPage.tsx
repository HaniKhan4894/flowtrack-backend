import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { UserPlus, Mail, Shield, Trash2, Search, Filter, X, Loader2, CheckCircle2 } from 'lucide-react';
import { teamService, type TeamMember } from '../../api/teamService';
import { Button, Input } from '../../components/ui';

const TeamPage = () => {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [isInviting, setIsInviting] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('member');
  const [showSuccess, setShowSuccess] = useState(false);
  const [invitationLink, setInvitationLink] = useState('');
  const [showInvitationModal, setShowInvitationModal] = useState(false);

  useEffect(() => {
    fetchMembers();
  }, []);

  const fetchMembers = async () => {
    try {
      const resp = await teamService.getAll();
      setMembers(resp.data);
    } catch (e) {
      console.error(e);
      // Fallback dummy data
      setMembers([
        { id: '1', first_name: 'Muhammad', last_name: 'Irfan', email: 'irfan@flowtrack.com', role: 'owner', joined_at: '2025-01-01' },
        { id: '2', first_name: 'Alice', last_name: 'Johnson', email: 'alice@flowtrack.com', role: 'admin', joined_at: '2025-01-10' },
        { id: '3', first_name: 'Bob', last_name: 'Smith', email: 'bob@flowtrack.com', role: 'member', joined_at: '2025-01-15' },
      ]);
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
      // Optional: Show toast
  };

  const filteredMembers = members.filter(m => 
    `${m.first_name} ${m.last_name}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
    m.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

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
        <Button onClick={() => setShowInviteModal(true)} className="w-fit">
          <UserPlus size={20} className="mr-2" />
          Invite Member
        </Button>
      </div>

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
        <button className="h-14 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-center gap-2 text-slate-400 hover:text-white hover:bg-white/10 transition-all px-4 font-medium">
          <Filter size={20} />
          Filter: All Roles
        </button>
      </div>

      <div className="glass rounded-3xl overflow-hidden border border-white/5 shadow-ai">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-white/5">
              <th className="px-6 py-4 text-sm font-bold text-slate-400 uppercase tracking-wider">Member</th>
              <th className="px-6 py-4 text-sm font-bold text-slate-400 uppercase tracking-wider">Role</th>
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
                <td className="px-6 py-4 text-slate-400 text-sm font-medium">
                  {new Date(member.joined_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                </td>
                <td className="px-6 py-4 text-right">
                  <button className="p-2 rounded-lg text-slate-500 hover:text-accent hover:bg-accent/10 transition-all opacity-0 group-hover:opacity-100">
                    <Trash2 size={18} />
                  </button>
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
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowInviteModal(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-lg glass-card border border-white/10 p-8 shadow-2xl"
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
                    {['member', 'admin'].map(role => (
                      <button
                        key={role}
                        type="button"
                        onClick={() => setInviteRole(role)}
                        className={`p-4 rounded-2xl border transition-all text-left ${inviteRole === role ? 'bg-primary-500/10 border-primary-500/50 text-white' : 'bg-white/5 border-white/10 text-slate-400 hover:bg-white/10'}`}
                      >
                        <div className="font-bold capitalize mb-1">{role}</div>
                        <div className="text-[10px] uppercase opacity-60">
                           {role === 'admin' ? 'Manage Projects & Team' : 'Track time & view tasks'}
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
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
             <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowInvitationModal(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-lg glass-card border border-white/10 p-8 shadow-2xl"
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

    </div>
  );
};

export default TeamPage;
