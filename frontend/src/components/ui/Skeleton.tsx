import { cn } from '../../lib/cn';

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className }: SkeletonProps) {
  return <div className={cn('skeleton rounded-lg', className)} aria-hidden />;
}

export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn('space-y-2', className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={cn('h-3', i === lines - 1 ? 'w-2/3' : 'w-full')} />
      ))}
    </div>
  );
}

export function SkeletonCard({ className }: SkeletonProps) {
  return (
    <div className={cn('rounded-2xl border border-white/5 bg-white/[0.02] p-5 space-y-4', className)}>
      <Skeleton className="h-4 w-1/3" />
      <Skeleton className="h-8 w-1/2" />
      <SkeletonText lines={2} />
    </div>
  );
}

export function SkeletonStat({ className }: SkeletonProps) {
  return (
    <div className={cn('rounded-2xl border border-white/5 bg-white/[0.02] p-5 space-y-3', className)}>
      <Skeleton className="h-3 w-20" />
      <Skeleton className="h-8 w-28" />
    </div>
  );
}

export function SkeletonTableRow({ cols = 4 }: { cols?: number }) {
  return (
    <div className="flex items-center gap-4 px-4 py-3 border-b border-white/5">
      {Array.from({ length: cols }).map((_, i) => (
        <Skeleton key={i} className={cn('h-4', i === 0 ? 'w-32' : 'flex-1')} />
      ))}
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div className="space-y-6 animate-in">
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <SkeletonStat />
        <SkeletonStat />
        <SkeletonStat />
        <SkeletonStat />
      </div>
      <SkeletonCard className="min-h-[240px]" />
    </div>
  );
}
