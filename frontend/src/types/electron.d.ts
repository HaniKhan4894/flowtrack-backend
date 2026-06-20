export {};

declare global {
  interface Window {
    electronAPI?: {
      getAppVersion: () => Promise<string>;
      isDesktop: () => Promise<boolean>;
      setAuthToken: (token: string) => Promise<{ success: boolean }>;
      logoutSession: () => Promise<{ success: boolean }>;
      windowMinimize: () => Promise<{ success: boolean }>;
      windowMaximize: () => Promise<{ success: boolean; isMaximized?: boolean }>;
      windowIsMaximized: () => Promise<{ isMaximized: boolean }>;
      windowClose: () => Promise<{ success: boolean }>;
      onWindowMaximizedChanged: (callback: (isMaximized: boolean) => void) => () => void;
      startTracking: (timeEntryId: number, token?: string | null) => Promise<{ success: boolean }>;
      stopTracking: () => Promise<{ success: boolean }>;
      pauseTracking: () => Promise<{ success: boolean }>;
      resumeTracking: () => Promise<{ success: boolean }>;
      captureNow: () => Promise<{ success: boolean; error?: string; activityLevel?: number; capturedScreens?: number }>;
      sendActivityEvent: (type: string) => void;
      onScreenshotCaptured: (callback: (data: { activityLevel: number }) => void) => () => void;
      onSystemLockChange: (callback: (locked: boolean) => void) => () => void;
      onSystemResume: (callback: () => void) => () => void;
      onTimerIdleChange: (callback: (state: 'paused' | 'resumed', data?: { idleMinutes?: number }) => void) => () => void;
      onAppLifecycle: (callback: (state: 'hide' | 'show' | 'shutdown') => void) => () => void;
    };
  }
}
