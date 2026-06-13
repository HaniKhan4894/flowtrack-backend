import { useEffect, useState } from 'react';
import { Users } from 'lucide-react';
import { teamService, type TeamMember } from '../api/teamService';
import { useAuthStore } from '../store/authStore';
import { canViewMemberTracking } from '../utils/access';

interface TeamMemberFilterProps {
  selectedUserId: number | null;
  onChange: (userId: number | null, member?: TeamMember) => void;
}

export function TeamMemberFilter({ selectedUserId, onChange }: TeamMemberFilterProps) {
  const { user } = useAuthStore();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const canPickMember = canViewMemberTracking(user);

  useEffect(() => {
    if (!canPickMember || !user?.organization_id) return;
    teamService.getAll()
      .then((resp) => setMembers(resp.data ?? []))
      .catch(() => setMembers([]));
  }, [canPickMember, user?.organization_id]);

  if (!canPickMember) return null;

  const value = selectedUserId ?? user?.id ?? '';

  return (
    <div className="relative">
      <Users className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
      <select
        value={value}
        onChange={(e) => {
          const id = Number(e.target.value);
          const member = members.find((m) => (m.user_id ?? m.id) === id);
          onChange(id, member);
        }}
        className="appearance-none h-10 bg-[#12141C] border border-white/10 rounded-xl pl-10 pr-8 text-sm text-white focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500/50 outline-none cursor-pointer min-w-[200px]"
      >
        {members.map((m) => {
          const id = m.user_id ?? m.id;
          return (
            <option key={id} value={id} className="bg-[#12141C]">
              {m.first_name} {m.last_name} ({m.role})
            </option>
          );
        })}
      </select>
    </div>
  );
}
