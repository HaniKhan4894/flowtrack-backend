import { Lock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { EmptyState } from './EmptyState';

interface PlanLockedStateProps {
  featureLabel?: string;
  description?: string;
}

/** Soft upgrade screen when a route is plan-gated. */
export function PlanLockedState({
  featureLabel = 'This feature',
  description,
}: PlanLockedStateProps) {
  const navigate = useNavigate();

  return (
    <EmptyState
      icon={Lock}
      title={`${featureLabel} isn’t on your plan`}
      description={
        description
        ?? 'Upgrade to unlock this capability for your team. Your existing data stays safe.'
      }
      actionLabel="View plans"
      onAction={() => navigate('/billing')}
      className="min-h-[50vh]"
    />
  );
}
