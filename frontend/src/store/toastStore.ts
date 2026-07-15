import { create } from 'zustand';

export type ToastVariant = 'success' | 'error' | 'info' | 'warning';

export interface ToastItem {
  id: string;
  title?: string;
  message: string;
  variant: ToastVariant;
  durationMs: number;
}

interface ToastState {
  toasts: ToastItem[];
  push: (toast: Omit<ToastItem, 'id'> & { id?: string }) => string;
  dismiss: (id: string) => void;
  clear: () => void;
}

let toastSeq = 0;

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  push: (toast) => {
    const id = toast.id ?? `toast-${Date.now()}-${++toastSeq}`;
    set((s) => ({
      toasts: [...s.toasts.slice(-4), { ...toast, id, durationMs: toast.durationMs ?? 4500 }],
    }));
    return id;
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  clear: () => set({ toasts: [] }),
}));

export function toast(message: string, variant: ToastVariant = 'info', title?: string) {
  return useToastStore.getState().push({ message, variant, title, durationMs: 4500 });
}

export function toastSuccess(message: string, title?: string) {
  return toast(message, 'success', title);
}

export function toastError(message: string, title?: string) {
  return toast(message, 'error', title);
}

export function toastWarning(message: string, title?: string) {
  return toast(message, 'warning', title);
}
