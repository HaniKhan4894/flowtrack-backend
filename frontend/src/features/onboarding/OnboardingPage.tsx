import { Link } from 'react-router-dom';
import { Sparkles, ArrowRight, Users, Plug, Timer, Camera, CreditCard } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { OnboardingChecklist } from '../dashboard/OnboardingChecklist';
import { Card, Button } from '../../components/ui';
import {
  canManageIntegrations,
  canManageProjects,
  canManageTeam,
  hasPlanFeature,
  canViewOrgPackage,
} from '../../utils/access';

export default function OnboardingPage() {
  const user = useAuthStore((s) => s.user);
  const canProjects = canManageProjects(user);
  const hasActivity = hasPlanFeature(user, 'activity_tracking');
  const hasIntegrations = hasPlanFeature(user, 'integrations');

  const steps = [
    {
      icon: Users,
      title: 'Invite your team',
      description: 'Bring remote teammates into FlowTrack so everyone’s time lands in one place.',
      href: '/team',
      show: canManageTeam(user),
    },
    {
      icon: Plug,
      title: 'Connect integrations',
      description: 'Link Slack, Jira, GitHub, or calendar for in-app workflows.',
      href: '/integrations',
      show: hasIntegrations && canManageIntegrations(user),
    },
    {
      icon: Timer,
      title: 'Start your first timer',
      description: 'Hit play on a project to create your first proof-of-work entry.',
      href: '/time',
      show: true,
    },
    {
      icon: Camera,
      title: 'Review activity',
      description: 'See apps, screenshots, and daily patterns after a tracking session.',
      href: '/activity',
      show: hasActivity,
    },
    {
      icon: CreditCard,
      title: 'Unlock monitoring',
      description: 'Upgrade to Starter to enable screenshots, activity tracking, and team monitoring.',
      href: '/billing',
      show: canViewOrgPackage(user) && !hasActivity,
    },
  ].filter((s) => s.show);

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <div className="text-center space-y-3">
        <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-ai-gradient shadow-ai mx-auto">
          <Sparkles className="text-white" size={28} />
        </div>
        <h1 className="text-3xl font-bold text-white">Welcome to FlowTrack</h1>
        <p className="text-slate-400 text-sm max-w-lg mx-auto">
          A quick guided setup so your remote team is productive in minutes — not days.
        </p>
      </div>

      <OnboardingChecklist />

      <div className="grid gap-4">
        {steps.map((step) => {
          const Icon = step.icon;
          return (
            <Card key={step.title} hover className="flex items-center gap-4">
              <div className="h-11 w-11 rounded-xl bg-primary-500/15 text-primary-300 flex items-center justify-center shrink-0">
                <Icon size={20} />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-white font-semibold">{step.title}</h3>
                <p className="text-xs text-slate-400 mt-0.5">{step.description}</p>
              </div>
              <Link to={step.href}>
                <Button size="sm" variant="secondary" className="!rounded-xl gap-1">
                  Go <ArrowRight size={14} />
                </Button>
              </Link>
            </Card>
          );
        })}

        {canProjects && (
          <Card hover className="flex items-center gap-4">
            <div className="h-11 w-11 rounded-xl bg-secondary-500/15 text-secondary-300 flex items-center justify-center shrink-0">
              <Sparkles size={20} />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-white font-semibold">Create a project</h3>
              <p className="text-xs text-slate-400 mt-0.5">Projects organize timers, invoices, and team capacity.</p>
            </div>
            <Link to="/projects">
              <Button size="sm" variant="secondary" className="!rounded-xl gap-1">
                Go <ArrowRight size={14} />
              </Button>
            </Link>
          </Card>
        )}
      </div>

      <div className="text-center">
        <Link to="/app" className="text-sm text-primary-400 font-semibold hover:underline">
          Skip to dashboard
        </Link>
      </div>
    </div>
  );
}
