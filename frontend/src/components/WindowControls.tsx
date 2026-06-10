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

  const handleMinimize = () => {
    void api.windowMinimize?.();
  };

  const handleMaximize = async () => {
    const res = await api.windowMaximize?.();
    if (res) setIsMaximized(Boolean(res.isMaximized));
  };

  const handleClose = () => {
    void api.windowClose?.();
  };

  const btnClass =
    'inline-flex h-9 w-10 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-white/10 hover:text-white';

  return (
    <div className={`flex items-center gap-0.5 no-drag ${className}`}>
      <button type="button" onClick={handleMinimize} className={btnClass} title="Minimize" aria-label="Minimize">
        <Minus className="h-4 w-4" strokeWidth={2.25} />
      </button>
      <button type="button" onClick={() => void handleMaximize()} className={btnClass} title={isMaximized ? 'Restore' : 'Maximize'} aria-label={isMaximized ? 'Restore' : 'Maximize'}>
        {isMaximized ? <Copy className="h-3.5 w-3.5" strokeWidth={2.25} /> : <Square className="h-3.5 w-3.5" strokeWidth={2.25} />}
      </button>
      <button
        type="button"
        onClick={handleClose}
        className={`${btnClass} hover:bg-red-500/20 hover:text-red-400`}
        title="Close"
        aria-label="Close"
      >
        <X className="h-4 w-4" strokeWidth={2.25} />
      </button>
    </div>
  );
}

export function DesktopTitleBar() {
  if (!isDesktopApp()) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[200] flex h-10 items-center justify-end px-3 drag-region pointer-events-none">
      <div className="pointer-events-auto">
        <WindowControls />
      </div>
    </div>
  );
}
