export {};

export type LiveActivitySnapshot = {
  tracking: boolean;
  current: {
    app_name: string;
    window_title: string;
    url: string;
    duration_seconds: number;
  } | null;
  soft_idle: boolean;
  system_idle_seconds: number;
  pending_count: number;
  queued_seconds: number;
  last_sync_at: number | null;
  last_sync_error: string | null;
  sync_in_flight: boolean;
};

declare global {
  interface Window {
    electronAPI?: {
      getAppVersion: () => Promise<string>;
      checkForUpdates: () => Promise<{ success: boolean; dev?: boolean; error?: string }>;
      downloadAppUpdate: () => Promise<{ success: boolean; error?: string }>;
      installAppUpdate: () => Promise<{ success: boolean; error?: string }>;
      getUpdateStatus: () => Promise<{ status: string; data?: Record<string, unknown> | null }>;
      onUpdateStatusChange: (callback: (state: { status: string; data?: Record<string, unknown> | null }) => void) => () => void;
      isDesktop: () => Promise<boolean>;
      desktopVariant: () => 'tracker';
      openWebApp: () => Promise<{ success: boolean }>;
      startBrowserSignIn: () => Promise<{ success: boolean; error?: string }>;
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
      getLiveActivity: () => Promise<LiveActivitySnapshot>;
      onActivityLive: (callback: (snapshot: LiveActivitySnapshot) => void) => () => void;
      onScreenshotCaptured: (callback: (data: { activityLevel: number }) => void) => () => void;
      onSystemLockChange: (callback: (locked: boolean) => void) => () => void;
      onSystemResume: (callback: () => void) => () => void;
      onTimerIdleChange: (callback: (state: 'paused' | 'resumed', data?: {
        idleMinutes?: number;
        keepIdleTime?: string;
        discardIdleSeconds?: number;
      }) => void) => () => void;
      onAppLifecycle: (callback: (state: 'hide' | 'show' | 'shutdown') => void) => () => void;
      onTimerReminderResume: (callback: () => void) => () => void;
      onTimerSyncRequired: (callback: () => void) => () => void;
      onBrowserSignInComplete: (callback: (tokens: {
        access_token: string;
        refresh_token?: string | null;
        organization_id?: number | null;
      }) => void) => () => void;
      onBrowserSignInError: (callback: (payload: { error?: string }) => void) => () => void;
    };
  }
}
