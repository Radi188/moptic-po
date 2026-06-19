import { Platform } from 'react-native';

import { api } from '@/api/client';

/**
 * Register this device's Expo push token with the staff backend so it can target
 * the device for push notifications.
 *
 * BACKEND: this expects `POST /push-token` (relative to the staff API base, e.g.
 * https://m-eyewear.com/api/v1/staff/push-token) accepting:
 *   { token: string, platform: 'ios' | 'android', branch_id?: number }
 * Adjust the path/payload here to match the route you add on the server.
 */
export async function registerPushToken(token: string, branchId?: string) {
  await api.post('/push-token', {
    token,
    platform: Platform.OS,
    ...(branchId ? { branch_id: Number(branchId) } : {}),
  });
}
