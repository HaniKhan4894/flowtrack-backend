import { useEffect, useState } from 'react';
import type { BadgeVariant } from '../../../components/ui';

export const formatCurrency = (value: number | string | null | undefined, currency = 'USD'): string => {
  const amount = Number(value ?? 0);
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: amount >= 1000 ? 0 : 2,
  }).format(amount);
};

export const formatNumber = (value: number | string | null | undefined): string =>
  new Intl.NumberFormat('en-US').format(Number(value ?? 0));

export const formatDate = (value: string | null | undefined): string => {
  if (!value) return '—';
  const date = new Date(value.replace(' ', 'T'));
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

export const formatDateTime = (value: string | null | undefined): string => {
  if (!value) return '—';
  const date = new Date(value.replace(' ', 'T'));
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

/** `2026-07` → `Jul 26`, for month-bucketed chart axes. */
export const formatMonthShort = (month: string): string => {
  const date = new Date(`${month}-01T00:00:00`);
  return Number.isNaN(date.getTime())
    ? month
    : date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
};

export const formatRelative = (value: string | null | undefined): string => {
  if (!value) return 'Never';
  const date = new Date(value.replace(' ', 'T'));
  if (Number.isNaN(date.getTime())) return value;

  const minutes = Math.floor((Date.now() - date.getTime()) / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
};

const STATUS_VARIANTS: Record<string, BadgeVariant> = {
  active: 'success',
  paid: 'success',
  trial: 'info',
  sent: 'info',
  past_due: 'warning',
  draft: 'default',
  cancelled: 'danger',
  expired: 'danger',
  suspended: 'danger',
};

export const statusVariant = (status: string | null | undefined): BadgeVariant =>
  STATUS_VARIANTS[String(status ?? '').toLowerCase()] ?? 'default';

export const humanizeStatus = (status: string | null | undefined): string =>
  String(status ?? 'none').replace(/_/g, ' ');

/** Debounce a value so typing in a search box doesn't hammer the API. */
export function useDebounced<T>(value: T, delayMs = 350): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
