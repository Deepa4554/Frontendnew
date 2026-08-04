import { Platform } from 'react-native';
import { getItem, setItem, removeItem } from './mmkv';

// On web, tokens are never persisted anywhere JS can read them — the httpOnly
// pos_access_token/pos_refresh_token cookies AuthController sets (see AuthCookies.cs) are
// the only place they live, so a same-origin XSS bug can no longer read them out of
// localStorage and walk off with the session. Native keeps using MMKV (backed by the
// platform keychain, not a scriptable web page) exactly as before.
const isWeb = Platform.OS === 'web';

export const getAccessToken = (): string | undefined => (isWeb ? undefined : getItem('accessToken'));
export const setAccessToken = (token: string): void => {
  if (!isWeb) setItem('accessToken', token);
};
export const clearAccessToken = (): void => removeItem('accessToken');

export const getStoredRefreshToken = (): string | undefined => (isWeb ? undefined : getItem('refreshToken'));
export const setStoredRefreshToken = (token: string): void => {
  if (!isWeb) setItem('refreshToken', token);
};
export const clearStoredRefreshToken = (): void => removeItem('refreshToken');
