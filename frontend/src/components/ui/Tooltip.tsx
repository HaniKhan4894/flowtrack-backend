import { useState, type ReactNode } from 'react';
import { cn } from '../../lib/cn';

interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  side?: 'top' | 'bottom';
  className?: string;
}

export function Tooltip({ content, children, side = 'top', className }: TooltipProps) {
  const [open, setOpen] = useState(false);

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {children}
      {open && (
        <span
          role="tooltip"
          className={cn(
            'absolute z-[150] whitespace-nowrap rounded-lg bg-[#12141C] border border-white/15 px-2.5 py-1.5 text-xs text-slate-200 shadow-lg pointer-events-none',
            side === 'top' ? 'bottom-full left-1/2 -translate-x-1/2 mb-2' : 'top-full left-1/2 -translate-x-1/2 mt-2',
            className,
          )}
        >
          {content}
        </span>
      )}
    </span>
  );
}
