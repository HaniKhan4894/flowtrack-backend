import { useEffect, useState } from 'react';
import client from '../api/client';

/**
 * True when the browser reports online AND the API health endpoint responds.
 */
export function useConnectivity(pollMs = 20_000) {
  const [browserOnline, setBrowserOnline] = useState(
    () => typeof navigator === 'undefined' || navigator.onLine,
  );
  const [apiReachable, setApiReachable] = useState(true);

  useEffect(() => {
    const onOnline = () => setBrowserOnline(true);
    const onOffline = () => {
      setBrowserOnline(false);
      setApiReachable(false);
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  useEffect(() => {
    if (!browserOnline) return;

    let cancelled = false;
    const ping = async () => {
      try {
        await client.get('/health', { timeout: 6000 });
        if (!cancelled) setApiReachable(true);
      } catch {
        if (!cancelled) setApiReachable(false);
      }
    };

    void ping();
    const id = window.setInterval(() => void ping(), pollMs);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [browserOnline, pollMs]);

  return browserOnline && apiReachable;
}
