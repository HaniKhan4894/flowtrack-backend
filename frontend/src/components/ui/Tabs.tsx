import { cn } from '../../lib/cn';

export interface TabItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  count?: number;
}

interface TabsProps {
  tabs: TabItem[];
  activeId: string;
  onChange: (id: string) => void;
  className?: string;
  size?: 'sm' | 'md';
}

export function Tabs({ tabs, activeId, onChange, className, size = 'md' }: TabsProps) {
  return (
    <div
      className={cn(
        'flex flex-wrap gap-1 p-1 rounded-xl bg-white/5 border border-white/10',
        className,
      )}
      role="tablist"
    >
      {tabs.map((tab) => {
        const active = tab.id === activeId;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.id)}
            className={cn(
              'inline-flex items-center gap-2 rounded-lg font-medium transition-all',
              size === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-sm',
              active
                ? 'bg-primary-500/20 text-white shadow-sm border border-primary-500/30'
                : 'text-slate-400 hover:text-white hover:bg-white/5 border border-transparent',
            )}
          >
            {tab.icon}
            {tab.label}
            {typeof tab.count === 'number' && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/10">{tab.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
