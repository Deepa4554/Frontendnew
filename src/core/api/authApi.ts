import { apiClient } from '../network/api';

export type AppRole = 'Owner' | 'Manager' | 'Cashier' | 'Chef' | 'Waiter' | 'KitchenStaff' | 'Accountant';
export type StaffAccessMode = 'Automatic' | 'Custom';

export interface ApiUser {
  id: number;
  email: string;
  phone: string | null;
  name: string;
  role: AppRole;
  profilePhoto: string | null;
  tenantId: number;
  isPlatformAdmin: boolean;
  /** Automatic = follow the role-based default; Custom = only allowedScreens is visible.
   * See core/auth/permissions.ts and the Staff Access screen. */
  accessMode: StaffAccessMode;
  allowedScreens: string[] | null;
  /** Which kitchen station's KOTs the KDS screen should pin this login to — set by an
   * Owner/Manager from the Staff Profile screen, not by this login itself. Null means no
   * server-side pin (falls back to this device's own remembered station). Owner logins
   * always ignore this. See core/kds/kdsDeviceSettings.ts. */
  assignedStationId: number | null;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: ApiUser;
}

export const authApi = {
  register: (email: string, password: string, name: string, role: AppRole) =>
    apiClient.post<AuthResponse>('/auth/register', { email, password, name, role }).then((r) => r.data),

  login: (email: string, password: string) =>
    apiClient.post<AuthResponse>('/auth/login', { email, password }).then((r) => r.data),

  refresh: (refreshToken?: string) =>
    apiClient.post<AuthResponse>('/auth/refresh', { refreshToken }).then((r) => r.data),

  // Revokes only this device's own session — every other device this account is
  // logged into (phone, another tab, ...) stays signed in. See RefreshTokenEntry's
  // backend doc comment for why a single logout can no longer nuke every session.
  logout: (refreshToken?: string | null) => apiClient.post<void>('/auth/logout', { refreshToken }).then((r) => r.data),

  me: () => apiClient.get<ApiUser>('/auth/me').then((r) => r.data),

  changePassword: (currentPassword: string, newPassword: string) =>
    apiClient.post<void>('/auth/change-password', { currentPassword, newPassword }).then((r) => r.data),

  requestOtp: (email: string) => apiClient.post<void>('/auth/request-otp', { email }).then((r) => r.data),

  registerCafe: (cafeName: string, email: string, password: string, ownerName: string, phone: string, otp: string) =>
    apiClient
      .post<AuthResponse>('/auth/register-cafe', { cafeName, email, password, ownerName, phone, otp })
      .then((r) => r.data),

  forgotPasswordRequestOtp: (email: string) =>
    apiClient.post<void>('/auth/forgot-password/request-otp', { email }).then((r) => r.data),

  resetPassword: (email: string, otp: string, newPassword: string) =>
    apiClient.post<void>('/auth/forgot-password/reset', { email, otp, newPassword }).then((r) => r.data),
};
