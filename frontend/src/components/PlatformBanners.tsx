import { useEffect, useState } from 'react';
import { AlertTriangle, Info, Megaphone, ShieldOff, TriangleAlert, X } from 'lucide-react';
import { announcementService } from '../api/announcementService';
import { adminService } from '../api/adminService';
import { getImpersonation, restoreAdminSession } from '../utils/impersonation';
import type { PlatformAnnouncementBanner } from '../types/admin';
import { cn } from '../lib/cn';

const LEVEL_STYLES: Record<PlatformAnnouncementBanner['level'], string> = {
  info: 'border-cyan-500/25 bg-cyan-500/10 text-cyan-100',
  success: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-100',
  warning: 'border-amber-500/25 bg-amber-500/10 text-amber-100',
  critical: 'border-rose-500/30 bg-rose-500/15 text-rose-100',
};

const LEVEL_ICONS: Record<PlatformAnnouncementBanner['level'], typeof Info> = {
  info: Info,
  success: Megaphone,
  warning: TriangleAlert,
  critical: AlertTriangle,
};

/**
 * Impersonation notice (with a way back to the admin session) plus any live
 * platform announcements. Renders nothing when there is nothing to show.
 */
export function PlatformBanners() {
  const [impersonation, setImpersonation] = useState(() => getImpersonation());
  const [isEnding, setIsEnding] = useState(false);
  const [remaining, setRemaining] = useState('');
  const [announcements, setAnnouncements] = useState<PlatformAnnouncementBanner[]>([]);

  useEffect(() => {
    let alive = true;
    announcementService
      .getActive()
      .then((response) => {
        if (alive) setAnnouncements(response.data ?? []);
      })
      .catch(() => undefined);

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!impersonation) return;

    const expiresAt = new Date(impersonation.expires_at.replace(' ', 'T')).getTime();
    const tick = () => {
      const msLeft = expiresAt - Date.now();
      if (msLeft <= 0) {
        setRemaining('expired');
        return;
      }
      const minutes = Math.floor(msLeft / 60000);
      const seconds = Math.floor((msLeft % 60000) / 1000);
      setRemaining(`${minutes}:${String(seconds).padStart(2, '0')}`);
    };

    const timer = window.setInterval(tick, 1000);
    tick();
    return () => window.clearInterval(timer);
  }, [impersonation]);

  const endImpersonation = async () => {
    setIsEnding(true);
    const sessionId = restoreAdminSession();
    try {
      if (sessionId) await adminService.stopImpersonation(sessionId);
    } catch {
      // The admin session is restored locally either way; a failed close is
      // only bookkeeping and shouldn't block the return trip.
    }
    setImpersonation(null);
    window.location.assign('/admin/users');
  };

  const dismiss = async (id: number) => {
    setAnnouncements((current) => current.filter((item) => item.id !== id));
    try {
      await announcementService.dismiss(id);
    } catch {
      // A failed dismissal only means the banner comes back on the next load.
    }
  };

  if (!impersonation && announcements.length === 0) return null;

  return (
    <div className="space-y-2 mb-6">
      {impersonation && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/15 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <ShieldOff size={18} className="text-amber-300 shrink-0" />
            <p className="text-sm text-amber-100 min-w-0">
              You are viewing FlowTrack as <span className="font-semibold">{impersonation.target_name}</span>
              <span className="text-amber-200/70"> ({impersonation.target_email})</span>
              {remaining && <span className="text-amber-200/70"> · session ends in {remaining}</span>}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void endImpersonation()}
            disabled={isEnding}
            className="shrink-0 rounded-xl bg-amber-500/25 border border-amber-500/40 px-3 py-1.5 text-xs font-semibold text-amber-100 hover:bg-amber-500/35 disabled:opacity-60"
          >
            {isEnding ? 'Returning…' : 'Return to admin'}
          </button>
        </div>
      )}

      {announcements.map((announcement) => {
        const Icon = LEVEL_ICONS[announcement.level];
        return (
          <div
            key={announcement.id}
            className={cn('rounded-2xl border px-4 py-3 flex items-start gap-3', LEVEL_STYLES[announcement.level])}
          >
            <Icon size={18} className="shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{announcement.title}</p>
              <p className="text-sm opacity-90 whitespace-pre-line">{announcement.message}</p>
            </div>
            {announcement.is_dismissible && (
              <button
                type="button"
                onClick={() => void dismiss(announcement.id)}
                className="shrink-0 p-1 rounded-lg opacity-70 hover:opacity-100 hover:bg-white/10"
                aria-label="Dismiss announcement"
              >
                <X size={16} />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
