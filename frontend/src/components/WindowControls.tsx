import { useEffect, useState } from 'react';
import { Minus, Square, X, Copy } from 'lucide-react';
import { isDesktopApp } from '../utils/electronAuth';

export function WindowControls({ className = '' }: { className?: string }) {
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    if (!isDesktopApp() || !window.electronAPI?.windowIsMaximized) return;

    void window.electronAPI.windowIsMaximized().then((res) => {
      setIsMaximized(Boolean(res?.isMaximized));
    });

    const unsubscribe = window.electronAPI.onWindowMaximizedChanged?.((maximized) => {
      setIsMaximized(maximized);
    });

    return () => unsubscribe?.();
  }, []);

  if (!isDesktopApp() || !window.electronAPI) return null;

  const api = window.electronAPI;

  const btnClass =
    'inline-flex h-8 w-11 items-center justify-center text-slate-400 transition-colors hover:bg-white/10 hover:text-white';

  return (
    <div className={`flex items-center no-drag ${className}`}>
      <button type="button" onClick={() => void api.windowMinimize?.()} className={btnClass} title="Minimize" aria-label="Minimize">
        <Minus className="h-3.5 w-3.5" strokeWidth={2.25} />
      </button>
      <button
        type="button"
        onClick={async () => {
          const res = await api.windowMaximize?.();
          if (res) setIsMaximized(Boolean(res.isMaximized));
        }}
        className={btnClass}
        title={isMaximized ? 'Restore' : 'Maximize'}
        aria-label={isMaximized ? 'Restore' : 'Maximize'}
      >
        {isMaximized ? <Copy className="h-3 w-3" strokeWidth={2.25} /> : <Square className="h-3 w-3" strokeWidth={2.25} />}
      </button>
      <button
        type="button"
        onClick={() => void api.windowClose?.()}
        className={`${btnClass} hover:bg-red-500 hover:text-white`}
        title="Close"
        aria-label="Close"
      >
        <X className="h-3.5 w-3.5" strokeWidth={2.25} />
      </button>
    </div>
  );
}

export function DesktopTitleBar() {
  if (!isDesktopApp()) return null;

  return (
    <div className="fixed inset-x-0 top-0 z-[9999] flex h-8 items-stretch justify-end border-b border-white/5 bg-[#0A0C12]/90 backdrop-blur-md">
      <div className="absolute inset-0 drag-region" />
      <div className="relative z-10 flex items-stretch">
        <WindowControls />
      </div>
    </div>
  );
}
