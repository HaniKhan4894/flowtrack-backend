import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, AlertCircle, Info, AlertTriangle, X } from 'lucide-react';
import { useToastStore, type ToastVariant } from '../../store/toastStore';
import { cn } from '../../lib/cn';

const icons: Record<ToastVariant, typeof Info> = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
  warning: AlertTriangle,
};

const styles: Record<ToastVariant, string> = {
  success: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
  error: 'border-rose-500/30 bg-rose-500/10 text-rose-200',
  info: 'border-primary-500/30 bg-primary-500/10 text-primary-100',
  warning: 'border-amber-500/30 bg-amber-500/10 text-amber-100',
};

function ToastItemView({
  id,
  title,
  message,
  variant,
  durationMs,
}: {
  id: string;
  title?: string;
  message: string;
  variant: ToastVariant;
  durationMs: number;
}) {
  const dismiss = useToastStore((s) => s.dismiss);
  const Icon = icons[variant];

  useEffect(() => {
    if (durationMs <= 0) return;
    const t = window.setTimeout(() => dismiss(id), durationMs);
    return () => window.clearTimeout(t);
  }, [id, durationMs, dismiss]);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, x: 24, scale: 0.96 }}
      className={cn(
        'pointer-events-auto w-full max-w-sm rounded-xl border px-4 py-3 shadow-glass backdrop-blur-md',
        styles[variant],
      )}
      role="status"
    >
      <div className="flex items-start gap-3">
        <Icon size={18} className="shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          {title && <p className="text-sm font-semibold text-white">{title}</p>}
          <p className="text-sm leading-snug opacity-90">{message}</p>
        </div>
        <button
          type="button"
          onClick={() => dismiss(id)}
          className="p-0.5 rounded text-white/50 hover:text-white"
          aria-label="Dismiss"
        >
          <X size={14} />
        </button>
      </div>
    </motion.div>
  );
}

export function ToastViewport() {
  const toasts = useToastStore((s) => s.toasts);

  return (
    <div className="fixed bottom-4 right-4 z-[300] flex flex-col gap-2 pointer-events-none no-drag">
      <AnimatePresence mode="popLayout">
        {toasts.map((t) => (
          <ToastItemView key={t.id} {...t} />
        ))}
      </AnimatePresence>
    </div>
  );
}
