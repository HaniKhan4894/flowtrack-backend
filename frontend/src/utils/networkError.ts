export function isNetworkError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const err = error as { code?: string; message?: string; response?: unknown };
  if (err.code === 'ERR_NETWORK' || err.code === 'ECONNABORTED') return true;
  if (!err.response) {
    const msg = String(err.message ?? '');
    return /network|failed to fetch|load failed|timeout/i.test(msg);
  }
  return false;
}
