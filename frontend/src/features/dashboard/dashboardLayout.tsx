import { useState } from 'react';
import { GripVertical, LayoutDashboard } from 'lucide-react';
import { Card, Badge } from '../../components/ui';
import { useAuthStore } from '../../store/authStore';
import { canViewMemberTracking } from '../../utils/access';

export type WidgetId = 'stats' | 'daily_goal' | 'live' | 'weekly' | 'recent';

const DEFAULT_ORDER: WidgetId[] = ['stats', 'daily_goal', 'live', 'weekly', 'recent'];
const STORAGE_KEY = 'flowtrack.dashboard.widgets';

function loadOrder(roleKey: string): WidgetId[] {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY}.${roleKey}`);
    if (!raw) return DEFAULT_ORDER;
    const parsed = JSON.parse(raw) as WidgetId[];
    if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_ORDER;
    const valid = parsed.filter((id): id is WidgetId => DEFAULT_ORDER.includes(id));
    return valid.length ? valid : DEFAULT_ORDER;
  } catch {
    return DEFAULT_ORDER;
  }
}

/** Lightweight per-role dashboard section order (persisted on this device). */
export function useDashboardLayout() {
  const user = useAuthStore((s) => s.user);
  const teamView = canViewMemberTracking(user);
  const roleKey = teamView ? 'manager' : 'member';
  const [order, setOrder] = useState<WidgetId[]>(() => loadOrder(roleKey));

  const save = (next: WidgetId[]) => {
    setOrder(next);
    localStorage.setItem(`${STORAGE_KEY}.${roleKey}`, JSON.stringify(next));
  };

  const move = (id: WidgetId, dir: -1 | 1) => {
    const idx = order.indexOf(id);
    if (idx < 0) return;
    const swap = idx + dir;
    if (swap < 0 || swap >= order.length) return;
    const next = [...order];
    [next[idx], next[swap]] = [next[swap], next[idx]];
    save(next);
  };

  return { order, move, roleKey };
}

export function DashboardLayoutEditor() {
  const { order, move, roleKey } = useDashboardLayout();
  const labels: Record<WidgetId, string> = {
    stats: 'Stat cards',
    daily_goal: 'Daily goal',
    live: 'Working now',
    weekly: 'Weekly chart',
    recent: 'Recent activity',
  };

  return (
    <Card className="space-y-3">
      <div className="flex items-center gap-2">
        <LayoutDashboard size={16} className="text-primary-400" />
        <h3 className="text-sm font-semibold text-white">Customize dashboard</h3>
        <Badge variant="primary">{roleKey}</Badge>
      </div>
      <p className="text-xs text-slate-500">Reorder primary sections for your role. Saved on this device.</p>
      <ul className="space-y-1">
        {order.map((id, index) => (
          <li key={id} className="flex items-center gap-2 rounded-xl bg-white/5 px-3 py-2">
            <GripVertical size={14} className="text-slate-600" />
            <span className="flex-1 text-sm text-slate-200">{labels[id]}</span>
            <button type="button" disabled={index === 0} onClick={() => move(id, -1)} className="text-xs text-slate-400 hover:text-white disabled:opacity-30">↑</button>
            <button type="button" disabled={index === order.length - 1} onClick={() => move(id, 1)} className="text-xs text-slate-400 hover:text-white disabled:opacity-30">↓</button>
          </li>
        ))}
      </ul>
    </Card>
  );
}
