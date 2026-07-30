import { useState, type ReactNode } from 'react';
import { AlertTriangle, ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Minus, Search } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Badge, Button, Card, Modal, Skeleton, cn } from '../../../components/ui';
import type { Pagination } from '../../../types/admin';
import { formatNumber, humanizeStatus, statusVariant } from './format';

export function StatusBadge({ status }: { status: string | null | undefined }) {
  return <Badge variant={statusVariant(status)}>{humanizeStatus(status)}</Badge>;
}

/* -------------------------------------------------------------- stat cards */

export function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  changePercent,
  tone = 'default',
}: {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  changePercent?: number;
  tone?: 'default' | 'positive' | 'warning' | 'danger';
}) {
  const toneClasses = {
    default: 'text-primary-300 bg-primary-500/10 border-primary-500/20',
    positive: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/20',
    warning: 'text-amber-300 bg-amber-500/10 border-amber-500/20',
    danger: 'text-rose-300 bg-rose-500/10 border-rose-500/20',
  }[tone];

  const TrendIcon = changePercent === undefined ? null : changePercent > 0 ? ArrowUp : changePercent < 0 ? ArrowDown : Minus;
  const trendClass =
    changePercent === undefined
      ? ''
      : changePercent > 0
        ? 'text-emerald-300'
        : changePercent < 0
          ? 'text-rose-300'
          : 'text-slate-400';

  return (
    <Card hover className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className={cn('h-10 w-10 rounded-xl border flex items-center justify-center', toneClasses)}>
          <Icon size={18} />
        </div>
        {TrendIcon && (
          <span className={cn('inline-flex items-center gap-1 text-xs font-semibold', trendClass)}>
            <TrendIcon size={13} />
            {Math.abs(changePercent ?? 0)}%
          </span>
        )}
      </div>
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
        <p className="text-2xl font-bold text-white mt-1 leading-tight">{value}</p>
        {hint && <p className="text-xs text-slate-400 mt-1">{hint}</p>}
      </div>
    </Card>
  );
}

export function StatCardSkeleton() {
  return (
    <Card className="space-y-3">
      <Skeleton className="h-10 w-10 rounded-xl" />
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-7 w-28" />
    </Card>
  );
}

/* ------------------------------------------------------------------ panels */

export function Panel({
  title,
  description,
  action,
  children,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card padding="none" className={cn('overflow-hidden', className)}>
      <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-white/10">
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-white">{title}</h2>
          {description && <p className="text-xs text-slate-400 mt-0.5">{description}</p>}
        </div>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </Card>
  );
}

/* ------------------------------------------------------------------- table */

export interface Column<T> {
  key: string;
  header: ReactNode;
  render: (row: T) => ReactNode;
  className?: string;
  align?: 'left' | 'right' | 'center';
}

export function DataTable<T>({
  columns,
  rows,
  isLoading,
  emptyMessage = 'Nothing to show yet.',
  rowKey,
  onRowClick,
}: {
  columns: Column<T>[];
  rows: T[];
  isLoading?: boolean;
  emptyMessage?: string;
  rowKey: (row: T) => string | number;
  onRowClick?: (row: T) => void;
}) {
  const alignClass = (align?: 'left' | 'right' | 'center') =>
    align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left';

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4">
            {columns.map((col) => (
              <Skeleton key={col.key} className="h-4 flex-1" />
            ))}
          </div>
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return <p className="text-sm text-slate-500 py-8 text-center">{emptyMessage}</p>;
  }

  return (
    <div className="overflow-x-auto -mx-1">
      <table className="w-full text-sm min-w-[640px]">
        <thead>
          <tr className="text-slate-500 border-b border-white/10">
            {columns.map((col) => (
              <th
                key={col.key}
                className={cn('pb-3 px-3 text-[11px] font-bold uppercase tracking-wide whitespace-nowrap', alignClass(col.align))}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={cn(
                'border-b border-white/5 text-slate-300 last:border-0',
                onRowClick && 'cursor-pointer hover:bg-white/[0.03] transition-colors',
              )}
            >
              {columns.map((col) => (
                <td key={col.key} className={cn('py-3 px-3 align-middle', alignClass(col.align), col.className)}>
                  {col.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PaginationBar({
  pagination,
  onPageChange,
}: {
  pagination: Pagination | null;
  onPageChange: (page: number) => void;
}) {
  if (!pagination || pagination.total === 0) return null;

  const { current_page: page, total_pages: totalPages, total, per_page: perPage } = pagination;
  const from = (page - 1) * perPage + 1;
  const to = Math.min(page * perPage, total);

  return (
    <div className="flex items-center justify-between gap-3 pt-4 mt-2 border-t border-white/10">
      <p className="text-xs text-slate-500">
        Showing <span className="text-slate-300 font-medium">{from}–{to}</span> of{' '}
        <span className="text-slate-300 font-medium">{formatNumber(total)}</span>
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          className="p-1.5 rounded-lg bg-white/5 border border-white/10 text-slate-300 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
          aria-label="Previous page"
        >
          <ChevronLeft size={16} />
        </button>
        <span className="text-xs text-slate-400 tabular-nums">
          {page} / {Math.max(1, totalPages)}
        </span>
        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          className="p-1.5 rounded-lg bg-white/5 border border-white/10 text-slate-300 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
          aria-label="Next page"
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ inputs */

export function SearchInput({
  value,
  onChange,
  placeholder = 'Search…',
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={cn('relative flex-1 min-w-[200px]', className)}>
      <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-3 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-primary-500/50 transition-colors"
      />
    </div>
  );
}

export function SelectFilter({
  value,
  onChange,
  options,
  label,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  label?: string;
  className?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={label}
      className={cn(
        'bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-primary-500/50 transition-colors',
        className,
      )}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value} className="bg-[#12141C]">
          {option.label}
        </option>
      ))}
    </select>
  );
}

export function FilterBar({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2 mb-5">{children}</div>;
}

/* ----------------------------------------------------------------- confirm */

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  destructive = false,
  requireReason = false,
  isLoading = false,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  destructive?: boolean;
  requireReason?: boolean;
  isLoading?: boolean;
  onConfirm: (reason: string) => void;
  onClose: () => void;
}) {
  const [reason, setReason] = useState('');

  const close = () => {
    setReason('');
    onClose();
  };

  return (
    <Modal open={open} onClose={close} title={title} size="md">
      <div className="space-y-4">
        {destructive && (
          <div className="flex items-start gap-3 rounded-xl border border-rose-500/25 bg-rose-500/10 px-4 py-3">
            <AlertTriangle size={18} className="text-rose-300 shrink-0 mt-0.5" />
            <p className="text-sm text-rose-100">This action cannot be undone.</p>
          </div>
        )}
        <div className="text-sm text-slate-300">{description}</div>
        <div className="space-y-2">
          <label className="text-xs font-medium text-slate-400" htmlFor="confirm-reason">
            Reason {requireReason ? '(required)' : '(optional, recorded in the audit log)'}
          </label>
          <textarea
            id="confirm-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-primary-500/50"
            placeholder="Support ticket #1234 — customer requested…"
          />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" size="sm" onClick={close} disabled={isLoading}>
            Cancel
          </Button>
          <Button
            size="sm"
            isLoading={isLoading}
            disabled={requireReason && reason.trim() === ''}
            onClick={() => onConfirm(reason.trim())}
            className={destructive ? 'bg-rose-500 hover:bg-rose-400 shadow-none' : undefined}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------- misc */

export function KeyValueList({ items }: { items: Array<{ label: string; value: ReactNode }> }) {
  return (
    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
      {items.map((item) => (
        <div key={item.label} className="flex items-baseline justify-between gap-3 border-b border-white/5 pb-2">
          <dt className="text-xs text-slate-500">{item.label}</dt>
          <dd className="text-sm text-slate-200 text-right min-w-0 truncate">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function ProgressBar({ percent, tone = 'primary' }: { percent: number; tone?: 'primary' | 'amber' | 'emerald' }) {
  const clamped = Math.max(0, Math.min(100, percent));
  const toneClass = {
    primary: 'bg-primary-400',
    amber: 'bg-amber-400',
    emerald: 'bg-emerald-400',
  }[tone];

  return (
    <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
      <div className={cn('h-full rounded-full transition-all', toneClass)} style={{ width: `${clamped}%` }} />
    </div>
  );
}

export function HealthDot({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm text-slate-300">
      <span className={cn('h-2 w-2 rounded-full', ok ? 'bg-emerald-400' : 'bg-rose-400')} />
      {label}
    </span>
  );
}
