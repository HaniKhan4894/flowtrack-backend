import { useCallback } from 'react';
import { useToastStore, type ToastVariant } from '../store/toastStore';

export function useToast() {
  const push = useToastStore((s) => s.push);
  const dismiss = useToastStore((s) => s.dismiss);

  const show = useCallback(
    (message: string, variant: ToastVariant = 'info', title?: string) =>
      push({ message, variant, title, durationMs: 4500 }),
    [push],
  );

  return {
    show,
    success: (message: string, title?: string) => show(message, 'success', title),
    error: (message: string, title?: string) => show(message, 'error', title),
    info: (message: string, title?: string) => show(message, 'info', title),
    warning: (message: string, title?: string) => show(message, 'warning', title),
    dismiss,
  };
}
