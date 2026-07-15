import type { HTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

export type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'primary';

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

const variants: Record<BadgeVariant, string> = {
  default: 'bg-white/10 text-slate-300 border-white/10',
  success: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/20',
  warning: 'bg-amber-500/15 text-amber-300 border-amber-500/20',
  danger: 'bg-rose-500/15 text-rose-300 border-rose-500/20',
  info: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/20',
  primary: 'bg-primary-500/15 text-primary-300 border-primary-500/20',
};

export function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide',
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}
