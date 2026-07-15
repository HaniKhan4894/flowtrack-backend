import { useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUiChromeStore } from '../store/uiChromeStore';
import { useTimerStore } from '../store/timerStore';
import { toastSuccess, toastError } from '../store/toastStore';
import { getApiErrorMessage } from '../utils/apiError';

function isTypingTarget(el: EventTarget | null) {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable;
}

export function useKeyboardShortcuts() {
  const navigate = useNavigate();
  const toggleCommandPalette = useUiChromeStore((s) => s.toggleCommandPalette);
  const toggleShortcutsHelp = useUiChromeStore((s) => s.toggleShortcutsHelp);
  const setCommandPaletteOpen = useUiChromeStore((s) => s.setCommandPaletteOpen);
  const setShortcutsHelpOpen = useUiChromeStore((s) => s.setShortcutsHelpOpen);
  const stop = useTimerStore((s) => s.stop);
  const isRunning = useTimerStore((s) => s.isRunning);

  const onKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;

      if (meta && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        toggleCommandPalette();
        return;
      }

      if (e.key === '?' && !meta && !isTypingTarget(e.target)) {
        e.preventDefault();
        toggleShortcutsHelp();
        return;
      }

      if (e.key === 'Escape') {
        setCommandPaletteOpen(false);
        setShortcutsHelpOpen(false);
        return;
      }

      if (isTypingTarget(e.target) || meta || e.altKey) return;

      if (e.key.toLowerCase() === 'g') {
        // wait for second key via session flag
        (window as Window & { __ftPendingG?: boolean }).__ftPendingG = true;
        window.setTimeout(() => {
          (window as Window & { __ftPendingG?: boolean }).__ftPendingG = false;
        }, 800);
        return;
      }

      const pendingG = (window as Window & { __ftPendingG?: boolean }).__ftPendingG;
      if (pendingG) {
        (window as Window & { __ftPendingG?: boolean }).__ftPendingG = false;
        const map: Record<string, string> = {
          d: '/app',
          t: '/time',
          a: '/activity',
          i: '/integrations',
          s: '/settings',
          p: '/projects',
          f: '/activity-feed',
        };
        const path = map[e.key.toLowerCase()];
        if (path) {
          e.preventDefault();
          navigate(path);
        }
        return;
      }

      if (e.key.toLowerCase() === 'x' && isRunning) {
        e.preventDefault();
        void stop()
          .then(() => toastSuccess('Timer stopped'))
          .catch((err) => toastError(getApiErrorMessage(err, 'Failed to stop timer')));
      }
    },
    [navigate, toggleCommandPalette, toggleShortcutsHelp, setCommandPaletteOpen, setShortcutsHelpOpen, stop, isRunning],
  );

  useEffect(() => {
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onKeyDown]);
}
