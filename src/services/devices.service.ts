/**
 * Tandara Device & System Service
 * Typed for future FastAPI endpoints:
 * GET    /api/v1/system/devices
 * GET    /api/v1/system/status
 * POST   /api/v1/system/devices/:id/test
 * POST   /api/v1/system/devices/:id/restart
 * POST   /api/v1/system/network-config
 * POST   /api/v1/system/notifications/retry
 */

import { Device, NotificationJob } from '../types';
import { apiRequest } from './api';

export interface NetworkConfigPayload {
  serverHost: string;
  apiPort: number;
  webPort: number;
}

export const devicesService = {
  async getDevices(): Promise<Device[]> {
    // When backend is connected:
    // return await apiRequest<Device[]>('/api/v1/system/devices');
    return [];
  },

  async testCamera(deviceId: string): Promise<{ success: boolean; message: string }> {
    return await apiRequest(`/api/v1/system/devices/${deviceId}/test`, { method: 'POST' });
  },

  async restartDevice(deviceId: string): Promise<void> {
    await apiRequest(`/api/v1/system/devices/${deviceId}/restart`, { method: 'POST' });
  },

  async saveNetworkConfig(payload: NetworkConfigPayload): Promise<void> {
    await apiRequest('/api/v1/system/network-config', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async retryFailedNotifications(): Promise<{ retriedCount: number }> {
    return await apiRequest('/api/v1/system/notifications/retry', { method: 'POST' });
  },

  async getNotificationQueue(): Promise<NotificationJob[]> {
    return [];
  },
};
