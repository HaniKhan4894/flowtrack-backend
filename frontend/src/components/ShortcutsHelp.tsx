import { Modal } from './ui/Modal';
import { useUiChromeStore } from '../store/uiChromeStore';

const SHORTCUTS = [
  { keys: '⌘/Ctrl + K', desc: 'Open command palette' },
  { keys: '?', desc: 'Show this shortcuts help' },
  { keys: 'Esc', desc: 'Close overlays' },
  { keys: 'G then D', desc: 'Go to Dashboard' },
  { keys: 'G then T', desc: 'Go to Time Tracking' },
  { keys: 'G then A', desc: 'Go to Activity' },
  { keys: 'G then P', desc: 'Go to Projects' },
  { keys: 'G then I', desc: 'Go to Integrations' },
  { keys: 'G then F', desc: 'Go to Activity Feed' },
  { keys: 'G then S', desc: 'Go to Settings' },
  { keys: 'X', desc: 'Stop active timer' },
];

export function ShortcutsHelp() {
  const open = useUiChromeStore((s) => s.shortcutsHelpOpen);
  const setOpen = useUiChromeStore((s) => s.setShortcutsHelpOpen);

  return (
    <Modal open={open} onClose={() => setOpen(false)} title="Keyboard shortcuts" size="md">
      <ul className="space-y-2">
        {SHORTCUTS.map((s) => (
          <li key={s.keys} className="flex items-center justify-between gap-4 py-2 border-b border-white/5 last:border-0">
            <span className="text-sm text-slate-300">{s.desc}</span>
            <kbd className="text-[11px] font-mono text-slate-400 bg-white/5 border border-white/10 rounded-lg px-2 py-1">
              {s.keys}
            </kbd>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
