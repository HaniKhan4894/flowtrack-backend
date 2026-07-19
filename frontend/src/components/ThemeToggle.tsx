import { Monitor, Moon, Sun } from 'lucide-react';
import { cn } from '../lib/cn';
import { useThemeStore, type ThemePreference } from '../store/themeStore';

const OPTIONS: { id: ThemePreference; label: string; icon: typeof Moon }[] = [
  { id: 'dark', label: 'Dark', icon: Moon },
  { id: 'light', label: 'Light', icon: Sun },
  { id: 'system', label: 'System', icon: Monitor },
];

/** Compact header control — cycles Dark → Light → System. */
export function ThemeToggleButton({ className }: { className?: string }) {
  const preference = useThemeStore((s) => s.preference);
  const cyclePreference = useThemeStore((s) => s.cyclePreference);
  const Icon = OPTIONS.find((o) => o.id === preference)?.icon ?? Moon;
  const label = OPTIONS.find((o) => o.id === preference)?.label ?? 'Dark';

  return (
    <button
      type="button"
      onClick={cyclePreference}
      className={cn(
        'inline-flex p-2.5 rounded-xl hover:bg-white/10 text-slate-400 hover:text-white transition-colors',
        className,
      )}
      title={`Theme: ${label} (click to change)`}
      aria-label={`Theme: ${label}. Click to change.`}
    >
      <Icon size={18} />
    </button>
  );
}

/** Settings-style segmented control. */
export function ThemePreferencePicker({ className }: { className?: string }) {
  const preference = useThemeStore((s) => s.preference);
  const setPreference = useThemeStore((s) => s.setPreference);

  return (
    <div
      className={cn(
        'inline-flex p-1 rounded-2xl bg-white/5 border border-white/10 gap-1',
        className,
      )}
      role="group"
      aria-label="Color theme"
    >
      {OPTIONS.map(({ id, label, icon: Icon }) => {
        const active = preference === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => setPreference(id)}
            className={cn(
              'flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-medium transition-all',
              active
                ? 'bg-primary-500/15 text-primary-300 border border-primary-500/30 shadow-ai'
                : 'text-slate-400 hover:text-white hover:bg-white/5 border border-transparent',
            )}
          >
            <Icon size={16} />
            {label}
          </button>
        );
      })}
    </div>
  );
}
