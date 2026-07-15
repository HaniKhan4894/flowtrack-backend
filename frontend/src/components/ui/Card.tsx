import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/cn';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  hover?: boolean;
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

const paddingMap = {
  none: '',
  sm: 'p-4',
  md: 'p-5',
  lg: 'p-6',
};

export function Card({ className, hover = false, padding = 'md', children, ...props }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-white/10 bg-white/[0.03]',
        hover && 'transition-all duration-300 hover:border-white/20 hover:bg-white/[0.05]',
        paddingMap[padding],
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  description,
  action,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex items-start justify-between gap-3 mb-4', className)}>
      <div>
        <h3 className="text-base font-semibold text-white">{title}</h3>
        {description && <p className="text-xs text-slate-400 mt-0.5">{description}</p>}
      </div>
      {action}
    </div>
  );
}
