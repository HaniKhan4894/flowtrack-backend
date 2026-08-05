import { useEffect, useState } from 'react';
import type { LiveActivitySnapshot } from '../types/electron';

/**
 * Subscribe to desktop live activity IPC (session top apps, etc.).
 * Sync status is intentionally not surfaced in the UI — background only.
 */
export function useLiveActivity(enabled: boolean) {
  const [snapshot, setSnapshot] = useState<LiveActivitySnapshot | null>(null);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined' || !window.electronAPI?.onActivityLive) {
      setSnapshot(null);
      return;
    }

    let cancelled = false;
    void window.electronAPI.getLiveActivity?.().then((s) => {
      if (!cancelled) setSnapshot(s);
    }).catch(() => undefined);

    const unsub = window.electronAPI.onActivityLive((next) => {
      setSnapshot(next);
    });

    return () => {
      cancelled = true;
      unsub();
    };
  }, [enabled]);

  return snapshot;
}
