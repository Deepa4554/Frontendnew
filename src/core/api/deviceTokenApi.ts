import { apiClient } from '../network/api';

export type DevicePlatform = 'Android' | 'iOS' | 'Web';

export const deviceTokenApi = {
  register: (token: string, platform: DevicePlatform) =>
    apiClient.post<void>('/device-tokens', { token, platform }).then((r) => r.data),
  unregister: (token: string) => apiClient.post<void>('/device-tokens/unregister', { token }).then((r) => r.data),
};
