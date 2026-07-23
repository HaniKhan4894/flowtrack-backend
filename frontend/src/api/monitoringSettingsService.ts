import client from './client';

export interface MemberMonitoringSettings {
  tracking_enabled: boolean;
  screenshots_enabled: boolean;
  screenshot_disabled_until: string | null;
  screenshot_disabled_from: string | null;
  screenshot_disabled_to: string | null;
  screenshots_active: boolean;
}

export const monitoringSettingsService = {
  getMySettings: async (): Promise<{ data: MemberMonitoringSettings }> => {
    const response = await client.get('/monitoring/settings');
    return response.data;
  },

  updateMySettings: async (
    data: Partial<Pick<MemberMonitoringSettings, 'tracking_enabled' | 'screenshots_enabled' | 'screenshot_disabled_until' | 'screenshot_disabled_from' | 'screenshot_disabled_to'>>,
  ): Promise<{ data: MemberMonitoringSettings }> => {
    const response = await client.put('/monitoring/settings', data);
    return response.data;
  },
};
