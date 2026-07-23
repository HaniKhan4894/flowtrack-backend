import { useCallback, useEffect, useState } from 'react';
import { isDesktopApp } from '../utils/electronAuth';

export type AppUpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error';

export interface AppUpdateState {
  status: AppUpdateStatus;
  data?: {
    version?: string;
    percent?: number;
    message?: string;
    dev?: boolean;
  } | null;
}

export function useAppUpdater() {
  const [version, setVersion] = useState('');
  const [update, setUpdate] = useState<AppUpdateState>({ status: 'idle', data: null });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const api = window.electronAPI;
    if (!isDesktopApp() || !api) return undefined;

    if (typeof api.getAppVersion === 'function') {
      void api.getAppVersion().then(setVersion).catch(() => {});
    }

    if (typeof api.getUpdateStatus === 'function') {
      void api.getUpdateStatus().then((state) => {
        if (state?.status) setUpdate(state as AppUpdateState);
      }).catch(() => {});
    }

    if (typeof api.onUpdateStatusChange !== 'function') {
      return undefined;
    }

    return api.onUpdateStatusChange((state) => {
      setUpdate(state as AppUpdateState);
      if (state.status === 'downloading' || state.status === 'checking') {
        setBusy(true);
      } else {
        setBusy(false);
      }
    });
  }, []);

  const checkForUpdates = useCallback(async () => {
    if (!window.electronAPI?.checkForUpdates) return;
    setBusy(true);
    try {
      await window.electronAPI.checkForUpdates();
    } finally {
      setBusy(false);
    }
  }, []);

  const downloadUpdate = useCallback(async () => {
    if (!window.electronAPI?.downloadAppUpdate) return;
    setBusy(true);
    try {
      await window.electronAPI.downloadAppUpdate();
    } finally {
      setBusy(false);
    }
  }, []);

  const installUpdate = useCallback(async () => {
    if (!window.electronAPI?.installAppUpdate) return;
    await window.electronAPI.installAppUpdate();
  }, []);

  return {
    version,
    update,
    busy,
    checkForUpdates,
    downloadUpdate,
    installUpdate,
    isPackagedDesktop: isDesktopApp() && typeof window.electronAPI?.getUpdateStatus === 'function',
  };
}
