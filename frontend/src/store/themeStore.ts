import { create } from 'zustand';

export type ThemePreference = 'dark' | 'light' | 'system';
export type ResolvedTheme = 'dark' | 'light';

const STORAGE_KEY = 'flowtrack-theme';

function readStoredPreference(): ThemePreference {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    if (value === 'light' || value === 'dark' || value === 'system') return value;
  } catch {
    /* ignore */
  }
  return 'dark';
}

export function getSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined') return 'dark';
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export function resolveTheme(preference: ThemePreference): ResolvedTheme {
  return preference === 'system' ? getSystemTheme() : preference;
}

export function applyResolvedTheme(resolved: ResolvedTheme): void {
  const root = document.documentElement;
  root.setAttribute('data-theme', resolved);
  root.style.colorScheme = resolved;

  const meta = document.querySelector('meta[name="color-scheme"]');
  if (meta) meta.setAttribute('content', resolved);
}

interface ThemeState {
  preference: ThemePreference;
  resolved: ResolvedTheme;
  setPreference: (preference: ThemePreference) => void;
  cyclePreference: () => void;
  syncFromSystem: () => void;
}

export const useThemeStore = create<ThemeState>((set, get) => {
  const preference = typeof window !== 'undefined' ? readStoredPreference() : 'dark';
  const resolved = resolveTheme(preference);

  return {
    preference,
    resolved,
    setPreference: (next) => {
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        /* ignore */
      }
      const resolvedNext = resolveTheme(next);
      applyResolvedTheme(resolvedNext);
      set({ preference: next, resolved: resolvedNext });
    },
    cyclePreference: () => {
      const order: ThemePreference[] = ['dark', 'light', 'system'];
      const idx = order.indexOf(get().preference);
      get().setPreference(order[(idx + 1) % order.length]);
    },
    syncFromSystem: () => {
      if (get().preference !== 'system') return;
      const resolvedNext = getSystemTheme();
      applyResolvedTheme(resolvedNext);
      set({ resolved: resolvedNext });
    },
  };
});
