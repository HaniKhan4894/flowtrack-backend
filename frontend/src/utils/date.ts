export function formatApiDate(
  value?: string | null,
  options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' }
): string {
  if (!value) {
    return '—';
  }

  const normalized = value.trim();
  if (!normalized || normalized.startsWith('0000-00-00')) {
    return '—';
  }

  const iso = normalized.includes('T') ? normalized : normalized.replace(' ', 'T');
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }

  return date.toLocaleDateString(undefined, options);
}
