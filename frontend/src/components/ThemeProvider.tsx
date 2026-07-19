import { useEffect, type ReactNode } from 'react';
import { applyResolvedTheme, useThemeStore } from '../store/themeStore';

/** Keeps `data-theme` in sync and listens for OS preference when mode is System. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const preference = useThemeStore((s) => s.preference);
  const resolved = useThemeStore((s) => s.resolved);
  const syncFromSystem = useThemeStore((s) => s.syncFromSystem);

  useEffect(() => {
    applyResolvedTheme(resolved);
  }, [resolved]);

  useEffect(() => {
    if (preference !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const onChange = () => syncFromSystem();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [preference, syncFromSystem]);

  return children;
}
