import { cn } from '../../lib/cn';

interface AvatarProps {
  name?: string | null;
  src?: string | null;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizes = {
  sm: 'h-7 w-7 text-[10px]',
  md: 'h-9 w-9 text-xs',
  lg: 'h-12 w-12 text-sm',
};

function initials(name?: string | null) {
  if (!name?.trim()) return '?';
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
}

export function Avatar({ name, src, size = 'md', className }: AvatarProps) {
  if (src) {
    return (
      <img
        src={src}
        alt={name ?? 'Avatar'}
        className={cn('rounded-full object-cover border border-white/10', sizes[size], className)}
      />
    );
  }

  return (
    <div
      className={cn(
        'rounded-full bg-primary-500/20 text-primary-200 border border-primary-500/30 flex items-center justify-center font-bold shrink-0',
        sizes[size],
        className,
      )}
      aria-label={name ?? 'Avatar'}
    >
      {initials(name)}
    </div>
  );
}
