import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { cn } from '../../lib/cn';

export type ModalSize = 'sm' | 'md' | 'lg' | 'xl' | 'full';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: ModalSize;
  className?: string;
  /** Close when clicking the backdrop (default true) */
  closeOnBackdrop?: boolean;
  /** Show the X button (default true) */
  showClose?: boolean;
}

const sizeClasses: Record<ModalSize, string> = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
  full: 'max-w-6xl',
};

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = 'md',
  className,
  closeOnBackdrop = true,
  showClose = true,
}: ModalProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // Focus first focusable in panel
    requestAnimationFrame(() => {
      const el = panelRef.current?.querySelector<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      el?.focus();
    });
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 modal-overlay" role="presentation">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0"
            onClick={closeOnBackdrop ? onClose : undefined}
            aria-hidden
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? titleId : undefined}
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={{ duration: 0.18 }}
            className={cn(
              'relative z-10 w-full modal-panel p-6 sm:p-8 max-h-[90vh] overflow-y-auto',
              sizeClasses[size],
              className,
            )}
            onClick={(e) => e.stopPropagation()}
          >
            {(title || showClose) && (
              <div className="flex items-start justify-between gap-4 mb-6">
                {title ? (
                  <h2 id={titleId} className="text-xl sm:text-2xl font-bold text-white">
                    {title}
                  </h2>
                ) : (
                  <span />
                )}
                {showClose && (
                  <button
                    type="button"
                    onClick={onClose}
                    className="p-1 rounded-lg text-slate-500 hover:text-white hover:bg-white/5 transition-colors"
                    aria-label="Close"
                  >
                    <X size={22} />
                  </button>
                )}
              </div>
            )}
            {children}
            {footer && <div className="mt-6 pt-4 border-t border-white/10">{footer}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
