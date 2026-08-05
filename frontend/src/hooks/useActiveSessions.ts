import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { reportService, type ActiveSession } from '../api/reportService';

export const ACTIVE_SESSIONS_QUERY_KEY = ['active-sessions'] as const;

function useDocumentVisible(): boolean {
  const [visible, setVisible] = useState(
    () => typeof document === 'undefined' || !document.hidden,
  );

  useEffect(() => {
    const onChange = () => setVisible(!document.hidden);
    document.addEventListener('visibilitychange', onChange);
    return () => document.removeEventListener('visibilitychange', onChange);
  }, []);

  return visible;
}

/**
 * Shared active-sessions poll used by Dashboard / Team / Standup / live-session hooks.
 * Pauses while the tab is hidden to cut background API noise.
 */
export function useActiveSessions(options?: {
  enabled?: boolean;
  /** Poll interval while the tab is visible. Default 60s. */
  pollMs?: number;
}) {
  const enabled = options?.enabled !== false;
  const pollMs = options?.pollMs ?? 60_000;
  const visible = useDocumentVisible();

  return useQuery<ActiveSession[]>({
    queryKey: ACTIVE_SESSIONS_QUERY_KEY,
    queryFn: () => reportService.getActiveSessions().then((r) => r.data ?? []),
    enabled,
    staleTime: 15_000,
    refetchInterval: enabled && visible ? pollMs : false,
    refetchIntervalInBackground: false,
  });
}
