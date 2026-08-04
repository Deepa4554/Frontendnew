import axios from 'axios';
import { Platform } from 'react-native';
import { IAuthRepository } from '../../domain/repositories/IAuthRepository';
import { AuthSession, User } from '../../domain/entities/User';
import { authApi, ApiUser } from '../../../../core/api/authApi';
import { deviceTokenApi } from '../../../../core/api/deviceTokenApi';
import {
  getAccessToken,
  setAccessToken,
  clearAccessToken,
  getStoredRefreshToken,
  setStoredRefreshToken,
  clearStoredRefreshToken,
} from '../../../../core/storage/tokenStore';
import { getPushToken } from '../../../../core/notifications/pushNotifications';
import { DEMO_PASSWORD, demoEmailFor } from '../demoAccounts';

/**
 * Best-effort device-token cleanup on logout — never lets a push-unregister failure block or
 * fail the sign-out.
 *
 * This used to return immediately on web, which mattered most exactly where web is used: a
 * shared front-counter tablet. The token stayed registered against whoever signed out, so
 * the next staff member on that device kept receiving the previous user's notifications.
 * getPushToken resolves to the right implementation per platform (see the two
 * pushNotifications files) — native via @react-native-firebase, web via the Firebase Web
 * SDK — and returns null wherever push simply isn't available, which this treats as
 * "nothing to unregister".
 */
const unregisterPushToken = async (): Promise<void> => {
  try {
    const token = await getPushToken();
    if (token) await deviceTokenApi.unregister(token);
  } catch {
    // A stale token left behind just means this device keeps getting pushes for an account
    // it already signed out of, until the next login re-registers it under whoever's next.
  }
};

const NAMES: Partial<Record<User['role'], string>> = {
  Owner: 'Admin User',
  Manager: 'Branch Manager',
  Waiter: 'Floor Waiter',
};

const toUser = (apiUser: ApiUser): User => ({
  id: String(apiUser.id),
  email: apiUser.email,
  phone: apiUser.phone ?? undefined,
  name: apiUser.name,
  role: apiUser.role,
  cafeId: String(apiUser.tenantId),
  profilePhoto: apiUser.profilePhoto ?? undefined,
  isPlatformAdmin: apiUser.isPlatformAdmin,
  screenAccessMode: apiUser.accessMode,
  allowedScreens: apiUser.allowedScreens,
  assignedStationId: apiUser.assignedStationId,
});

const persistTokens = (accessToken: string, refreshToken: string) => {
  setAccessToken(accessToken);
  setStoredRefreshToken(refreshToken);
};

export class AuthRepository implements IAuthRepository {
  async loginWithEmail(email: string, password: string, role: User['role'] = 'Owner'): Promise<AuthSession> {
    // If the caller passed the real login form (not the role-picker demo
    // flow), just log in for real — no bridging.
    const isDemoFlow = email === demoEmailFor(role) || !email;
    const targetEmail = isDemoFlow ? demoEmailFor(role) : email;
    const targetPassword = isDemoFlow ? DEMO_PASSWORD : password;

    try {
      const res = await authApi.login(targetEmail, targetPassword);
      persistTokens(res.accessToken, res.refreshToken);
      return { accessToken: res.accessToken, refreshToken: res.refreshToken, user: toUser(res.user) };
    } catch (err) {
      const is401 = axios.isAxiosError(err) && err.response?.status === 401;
      if (!is401 || !isDemoFlow) throw err;

      // Demo account doesn't exist yet on this backend — create it once.
      const res = await authApi.register(targetEmail, targetPassword, NAMES[role] ?? 'Team Member', role);
      persistTokens(res.accessToken, res.refreshToken);
      return { accessToken: res.accessToken, refreshToken: res.refreshToken, user: toUser(res.user) };
    }
  }

  async loginWithMobile(_phone: string, _otp: string): Promise<AuthSession> {
    throw new Error('Method not implemented.');
  }

  async registerCafe(cafeName: string, email: string, password: string, ownerName: string, phone: string, otp: string): Promise<AuthSession> {
    const res = await authApi.registerCafe(cafeName, email, password, ownerName, phone, otp);
    persistTokens(res.accessToken, res.refreshToken);
    return { accessToken: res.accessToken, refreshToken: res.refreshToken, user: toUser(res.user) };
  }

  async logout(): Promise<void> {
    try {
      await authApi.logout(getStoredRefreshToken());
    } finally {
      await unregisterPushToken();
      clearAccessToken();
      clearStoredRefreshToken();
    }
  }

  async getCurrentUser(): Promise<User | null> {
    try {
      const apiUser = await authApi.me();
      return toUser(apiUser);
    } catch {
      return null;
    }
  }

  /// Called once on app boot to validate whatever session is available. Native has a
  /// locally-stored access token to check first (skip the network round-trip when it's
  /// definitely absent); web has none to inspect (see tokenStore.ts) — the httpOnly
  /// session cookie is invisible to JS, so /auth/me is the only way to find out whether
  /// one is still live.
  async restoreSession(): Promise<User | null> {
    if (Platform.OS !== 'web' && !getAccessToken()) return null;
    return this.getCurrentUser();
  }
}
