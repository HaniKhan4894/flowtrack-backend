import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search, Clock, LayoutDashboard, Briefcase, Users, Plug, FileText,
  Settings, Brain, MessageSquare, Activity, Sparkles, Timer, Plus,
} from 'lucide-react';
import { Modal } from './ui/Modal';
import { useUiChromeStore } from '../store/uiChromeStore';
import { useAuthStore } from '../store/authStore';
import { getNavItemsForUser } from '../utils/access';
import { useTimerStore } from '../store/timerStore';
import { toastSuccess, toastError } from '../store/toastStore';
import { getApiErrorMessage } from '../utils/apiError';
import { cn } from '../lib/cn';

type Action = {
  id: string;
  label: string;
  hint?: string;
  icon: typeof Search;
  keywords?: string;
  run: () => void;
};

export function CommandPalette() {
  const open = useUiChromeStore((s) => s.commandPaletteOpen);
  const setOpen = useUiChromeStore((s) => s.setCommandPaletteOpen);
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const isRunning = useTimerStore((s) => s.isRunning);
  const stop = useTimerStore((s) => s.stop);

  const actions = useMemo<Action[]>(() => {
    const nav = getNavItemsForUser(user).map((item) => ({
      id: `nav-${item.path}`,
      label: item.label,
      hint: item.path,
      icon: item.icon,
      keywords: `${item.label} ${item.path}`,
      run: () => navigate(item.path),
    }));

    const quick: Action[] = [
      {
        id: 'go-time',
        label: 'Open Time Tracking',
        hint: 'Start or manage timer',
        icon: Clock,
        keywords: 'timer track time',
        run: () => navigate('/time'),
      },
      {
        id: 'go-dashboard',
        label: 'Go to Dashboard',
        icon: LayoutDashboard,
        run: () => navigate('/app'),
      },
      {
        id: 'go-projects',
        label: 'Projects',
        icon: Briefcase,
        run: () => navigate('/projects'),
      },
      {
        id: 'go-team',
        label: 'Team',
        icon: Users,
        run: () => navigate('/team'),
      },
      {
        id: 'go-integrations',
        label: 'Integrations',
        icon: Plug,
        keywords: 'slack jira github',
        run: () => navigate('/integrations'),
      },
      {
        id: 'go-slack',
        label: 'Slack Workspace',
        icon: MessageSquare,
        run: () => navigate('/integrations/slack'),
      },
      {
        id: 'go-jira',
        label: 'Jira Workspace',
        icon: Briefcase,
        run: () => navigate('/integrations/jira'),
      },
      {
        id: 'go-github',
        label: 'GitHub Workspace',
        icon: Sparkles,
        run: () => navigate('/integrations/github'),
      },
      {
        id: 'go-invoices',
        label: 'Invoices',
        icon: FileText,
        run: () => navigate('/invoices'),
      },
      {
        id: 'go-insights',
        label: 'Insights',
        icon: Brain,
        run: () => navigate('/insights'),
      },
      {
        id: 'go-feed',
        label: 'Activity Feed',
        icon: Activity,
        keywords: 'notifications feed',
        run: () => navigate('/activity-feed'),
      },
      {
        id: 'go-settings',
        label: 'Settings',
        icon: Settings,
        run: () => navigate('/settings'),
      },
      {
        id: 'go-onboarding',
        label: 'Onboarding / Getting Started',
        icon: Plus,
        run: () => navigate('/onboarding'),
      },
    ];

    if (isRunning) {
      quick.unshift({
        id: 'stop-timer',
        label: 'Stop timer',
        hint: 'Shortcut: X',
        icon: Timer,
        keywords: 'stop pause timer',
        run: () => {
          void stop()
            .then(() => toastSuccess('Timer stopped'))
            .catch((err) => toastError(getApiErrorMessage(err, 'Failed to stop timer')));
        },
      });
    }

    // Prefer unique by id; nav items may overlap with quick — keep first
    const seen = new Set<string>();
    const merged = [...quick, ...nav].filter((a) => {
      if (seen.has(a.id)) return false;
      seen.add(a.id);
      return true;
    });
    return merged;
  }, [user, navigate, isRunning, stop]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return actions.slice(0, 12);
    return actions
      .filter((a) => `${a.label} ${a.hint ?? ''} ${a.keywords ?? ''}`.toLowerCase().includes(q))
      .slice(0, 12);
  }, [actions, query]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActive(0);
    }
  }, [open]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  const runActive = () => {
    const item = filtered[active];
    if (!item) return;
    setOpen(false);
    item.run();
  };

  return (
    <Modal
      open={open}
      onClose={() => setOpen(false)}
      showClose={false}
      size="lg"
      className="!p-0 overflow-hidden"
    >
      <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10">
        <Search size={18} className="text-slate-500 shrink-0" />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActive((i) => Math.min(i + 1, Math.max(filtered.length - 1, 0)));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((i) => Math.max(i - 1, 0));
            } else if (e.key === 'Enter') {
              e.preventDefault();
              runActive();
            }
          }}
          placeholder="Search pages and actions…"
          className="flex-1 bg-transparent text-white text-sm outline-none placeholder:text-slate-600"
        />
        <kbd className="hidden sm:inline text-[10px] text-slate-500 border border-white/10 rounded px-1.5 py-0.5">ESC</kbd>
      </div>
      <ul className="max-h-[360px] overflow-y-auto p-2">
        {filtered.length === 0 ? (
          <li className="px-3 py-8 text-center text-sm text-slate-500">No matches</li>
        ) : (
          filtered.map((item, idx) => {
            const Icon = item.icon;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onMouseEnter={() => setActive(idx)}
                  onClick={() => {
                    setOpen(false);
                    item.run();
                  }}
                  className={cn(
                    'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition',
                    idx === active ? 'bg-primary-500/15 text-white' : 'text-slate-300 hover:bg-white/5',
                  )}
                >
                  <Icon size={16} className="text-primary-400 shrink-0" />
                  <span className="flex-1 text-sm font-medium truncate">{item.label}</span>
                  {item.hint && <span className="text-[11px] text-slate-500 truncate">{item.hint}</span>}
                </button>
              </li>
            );
          })
        )}
      </ul>
      <div className="px-4 py-2 border-t border-white/10 text-[11px] text-slate-500 flex gap-3">
        <span>↑↓ navigate</span>
        <span>↵ open</span>
        <span>?</span>
        <span className="ml-auto">Cmd/Ctrl+K</span>
      </div>
    </Modal>
  );
}
