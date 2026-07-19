import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, Circle, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { authService } from '../../api/authService';
import { canManageProjects, hasPlanFeature } from '../../utils/access';
import type { OnboardingProgress } from '../../types';

const STEP_LINKS: Record<string, string> = {
  avatar: '/settings',
  project: '/projects',
  timer: '/app',
  invite: '/team',
  activity: '/activity',
};

interface OnboardingChecklistProps {
  compact?: boolean;
}

export function OnboardingChecklist({ compact = false }: OnboardingChecklistProps) {
  const { user, setUser } = useAuthStore();
  const onboarding: OnboardingProgress | null | undefined = user?.onboarding;
  const hasActivity = hasPlanFeature(user, 'activity_tracking');

  useEffect(() => {
    if (!user || onboarding?.is_complete) return;
    authService.me()
      .then((resp) => setUser(resp.data))
      .catch(() => undefined);
  }, [user?.id, onboarding?.is_complete, setUser]);

  if (!onboarding || onboarding.is_complete) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className={`bg-white/5 border border-white/10 rounded-3xl ${compact ? 'p-5' : 'p-8'}`}
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-primary-500/10 text-primary-400">
            <Sparkles size={20} />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">Getting Started</h3>
            <p className="text-xs text-slate-500">{onboarding.completed_count} of {onboarding.total_steps} complete</p>
          </div>
        </div>
        <span className="text-sm font-bold text-primary-400">{onboarding.percent}%</span>
      </div>

      <div className="h-2 bg-white/5 rounded-full overflow-hidden mb-5">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${onboarding.percent}%` }}
          className="h-full bg-ai-gradient rounded-full"
        />
      </div>

      <ul className="space-y-3">
        {onboarding.steps.map((step) => {
          let link = STEP_LINKS[step.key];
          if (step.key === 'project' && !canManageProjects(user)) {
            link = '/app';
          }
          if (step.key === 'activity' && !hasActivity) {
            link = '/billing';
          }
          const content = (
            <div className="flex items-center gap-3">
              {step.completed ? (
                <CheckCircle2 size={18} className="text-emerald-400 shrink-0" />
              ) : (
                <Circle size={18} className="text-slate-600 shrink-0" />
              )}
              <span className={`text-sm ${step.completed ? 'text-slate-500 line-through' : 'text-slate-200'}`}>
                {step.label}
              </span>
            </div>
          );

          return (
            <li key={step.key}>
              {!step.completed && link ? (
                <Link to={link} className="block hover:bg-white/5 rounded-xl px-2 py-1.5 -mx-2 transition-colors">
                  {content}
                </Link>
              ) : (
                <div className="px-2 py-1.5 -mx-2">{content}</div>
              )}
            </li>
          );
        })}
      </ul>
    </motion.div>
  );
}

export default OnboardingChecklist;
