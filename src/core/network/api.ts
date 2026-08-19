import axios, { AxiosError } from 'axios';
import { Platform } from 'react-native';
import { getApiBaseUrl } from '../config/env';
import { noteServerDate } from './serverClock';
import {
  getAccessToken,
  setAccessToken,
  clearAccessToken,
  getStoredRefreshToken,
  setStoredRefreshToken,
  clearStoredRefreshToken,
} from '../storage/tokenStore';

// Web never sees a token in JS (see tokenStore.ts) — withCredentials makes the browser
// attach the httpOnly pos_access_token/pos_refresh_token cookies automatically instead.
// Meaningless (and safely ignored) on native, which has no cookie jar concept here.
const isWeb = Platform.OS === 'web';

export const apiClient = axios.create({
  baseURL: getApiBaseUrl(),
  timeout: 15000,
  withCredentials: isWeb,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Registered by the auth layer at app startup (see authSlice) so this module
// never has to import the Redux store directly — importing it here would
// create a require-cycle (store -> authSlice -> AuthRepository -> apiClient).
let onSessionExpired: (() => void) | null = null;
export const registerSessionExpiredHandler = (handler: () => void) => {
  onSessionExpired = handler;
};

/**
 * Same registration pattern, for the other thing this app can't recover from on its own: a
 * 409 from an order endpoint means another device got there first ("Order is already paid",
 * "Table already has an open order", "This order was already confirmed"). The backend now
 * serialises those writes so the loser is told rather than silently overwritten — but the
 * losing device is still showing the state it decided from, and would keep showing it until
 * the next poll or push happened to land. Refetching immediately turns "why did that fail?"
 * into a screen that visibly agrees with what actually happened.
 */
let onConcurrentEditConflict: ((url: string) => void) | null = null;
export const registerConflictHandler = (handler: (url: string) => void) => {
  onConcurrentEditConflict = handler;
};

// A 402 means SubscriptionExpiryMiddleware blocked the request tenant-wide (see its
// comments) — every screen's queries start failing with this at once, not just one.
// Rather than each screen showing its own "plan expired" error, this surfaces one
// app-wide blocking overlay the instant the first request hits it.
let onPlanExpired: (() => void) | null = null;
export const registerPlanExpiredHandler = (handler: () => void) => {
  onPlanExpired = handler;
};

apiClient.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// The backend rotates the refresh token on every /auth/refresh call — the old one
// stops working the instant a new one is issued (single-slot per user, see
// AuthController.IssueTokensAsync). If the access token expires while several
// requests are in flight at once (e.g. a screen firing multiple queries in
// parallel), each one used to fire its OWN /auth/refresh call independently: the
// first succeeded and stored a fresh token, but every other one raced in with the
// now-stale token, got rejected, and force-logged the user out — wiping out the
// session the first call had just successfully renewed. This in-flight promise
// makes every 401 that lands while a refresh is already running just wait on that
// one shared attempt instead of racing it.
let refreshPromise: Promise<{ accessToken: string }> | null = null;

const refreshTokens = (refreshToken?: string) => {
  if (!refreshPromise) {
    // On web, refreshToken is always undefined (axios drops it from the JSON body) — the
    // request instead rides the httpOnly pos_refresh_token cookie via withCredentials,
    // which AuthController.Refresh falls back to reading when the body has none.
    refreshPromise = axios
      .post(`${getApiBaseUrl()}/auth/refresh`, { refreshToken }, { withCredentials: isWeb })
      .then(({ data }) => {
        setAccessToken(data.accessToken);
        setStoredRefreshToken(data.refreshToken);
        return { accessToken: data.accessToken };
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
};

apiClient.interceptors.response.use(
  (response) => {
    // Every reply carries the server's own clock in its Date header — see serverClock.ts for
    // why anything measuring the age of a server timestamp must not use the device's instead.
    noteServerDate(response.headers?.date);
    return response;
  },
  async (error: AxiosError) => {
    // An error response is still a response, and its Date header is just as good.
    if (error.response) noteServerDate(error.response.headers?.date);
    const originalRequest = error.config as (typeof error.config & { _retry?: boolean }) | undefined;

    const isAuthEndpoint = originalRequest?.url?.includes('/auth/login') || originalRequest?.url?.includes('/auth/register');
    if (error.response?.status === 401 && originalRequest && !originalRequest._retry && !isAuthEndpoint) {
      originalRequest._retry = true;
      const refreshToken = getStoredRefreshToken();
      // Web has no local token to check (tokenStore.ts never stores one there) — the only
      // way to know whether the session cookie is still good is to just try the refresh.
      const canAttemptRefresh = isWeb || !!refreshToken;

      if (canAttemptRefresh) {
        try {
          const { accessToken } = await refreshTokens(refreshToken);
          originalRequest.headers = originalRequest.headers ?? {};
          originalRequest.headers.Authorization = `Bearer ${accessToken}`;
          return apiClient(originalRequest);
        } catch (refreshError) {
          clearAccessToken();
          clearStoredRefreshToken();
          onSessionExpired?.();
          return Promise.reject(refreshError);
        }
      } else {
        onSessionExpired?.();
      }
    }

    // See registerConflictHandler. Deliberately does NOT swallow the error — the caller
    // still shows its own toast with the server's message; this only makes sure the data
    // underneath that toast catches up at the same time.
    if (error.response?.status === 409 && originalRequest?.url) {
      onConcurrentEditConflict?.(originalRequest.url);
    }

    if (error.response?.status === 402) {
      onPlanExpired?.();
    }

    return Promise.reject(error);
  },
);

/**
 * Extracts a human-readable message from any PrabandhOS.Api error response —
 * both the plain ProblemDetails shape our GlobalExceptionHandler returns
 * (ApiValidationException/ApiConflictException -> `title`) and ASP.NET's
 * built-in ValidationProblemDetails shape for model-binding failures
 * (`errors` field-name -> message[] map).
 */
export const getApiErrorMessage = (error: unknown, fallback = 'Something went wrong. Please try again.'): string => {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as { title?: string; detail?: string; errors?: Record<string, string[]> } | undefined;
    if (data?.errors) {
      const first = Object.values(data.errors)[0];
      if (first?.length) return first[0];
    }
    if (data?.title) return data.title;
    if (data?.detail) return data.detail;
    if (error.message === 'Network Error') return 'Cannot reach the server. Check your connection and try again.';
  }
  return fallback;
};
