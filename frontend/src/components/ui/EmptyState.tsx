import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { Button } from './Button';

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  children?: ReactNode;
  className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
  children,
  className,
}: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center text-center py-12 px-6', className)}>
      {Icon && (
        <div className="h-14 w-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-4 text-slate-400">
          <Icon size={26} />
        </div>
      )}
      <h3 className="text-lg font-semibold text-white">{title}</h3>
      {description && <p className="text-sm text-slate-400 mt-2 max-w-md">{description}</p>}
      {actionLabel && onAction && (
        <Button size="sm" className="mt-5" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
      {children}
    </div>
  );
}
