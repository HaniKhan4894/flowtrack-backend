import type { InputHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export function Input({ label, error, className, ...props }: InputProps) {
  return (
    <div className="space-y-2">
      {label && <label className="text-sm font-medium text-slate-400 ml-1">{label}</label>}
      <input
        className={cn(
          'w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-white placeholder:text-slate-600 focus:outline-none focus:border-primary-500/50 focus:bg-white/8 transition-all',
          error && 'border-accent/50 focus:border-accent',
          className,
        )}
        {...props}
      />
      {error && <p className="text-xs text-accent mt-1 ml-1">{error}</p>}
    </div>
  );
}
