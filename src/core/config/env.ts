import { Platform } from 'react-native';

// Single source of truth for where the deployed PrabandhOS.Api lives. Change
// this one line if the backend ever moves to a different host — everything
// in the app (apiClient, QR ordering links, refresh-token calls) reads
// through getApiBaseUrl()/getHubBaseUrl()/getPublicOrderBaseUrl() below.
const PRODUCTION_API_ORIGIN = 'https://cafeposapi-85wt.onrender.com';

// Flip to true while testing against a locally-running backend (`dotnet run`
// in CafePosApi, listening on 0.0.0.0:5080). When true, the backend URL is
// derived from the browser's current hostname/IP so it works on any WiFi
// without needing to update the hardcoded IP.
const USE_LOCAL_API = false;

function getLocalApiOrigin(): string {
  // Use whatever IP/hostname the browser is currently accessing from,
  // just change the port to 5080 for the backend. This way localhost,
  // 192.168.x.x, or any other IP automatically works.
  const host = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
  return `http://${host}:5080`;
}

const isWeb = Platform.OS === 'web';
const API_ORIGIN = USE_LOCAL_API ? getLocalApiOrigin() : PRODUCTION_API_ORIGIN;

// The web build's auth relies entirely on the httpOnly pos_access_token/pos_refresh_token
// cookies (see AuthCookies.cs — no token ever touches JS, an XSS-hardening measure). Those
// cookies are SameSite=None so they're legal cross-site, but browsers now block SameSite=None
// cookies outright as "third-party" whenever the frontend and API sit on different
// registrable domains (vercel.app vs onrender.com here) — confirmed 2026-08-01: the API
// itself works fine (curl with the cookie returns 200), but Chrome never attaches it, in
// incognito *or* normal windows. Routing web traffic through Vercel's same-origin
// /api & /hubs rewrite (vercel.json) instead of calling the Render host directly makes the
// cookie first-party from the browser's point of view. Native has no such issue (no cookie
// jar, no origin — it carries its MMKV token via an Authorization header instead), so it
// keeps hitting the real backend origin directly, USE_LOCAL_API and all.
const WEB_PROXIED_ORIGIN = '';

export const getApiBaseUrl = (): string => `${isWeb && !USE_LOCAL_API ? WEB_PROXIED_ORIGIN : API_ORIGIN}/api`;

/** Same-origin-on-web reasoning as getApiBaseUrl() — this is the SignalR hub connection,
 * which also rides the pos_access_token cookie on web (see ordersRealtime.ts). */
export const getHubBaseUrl = (): string => (isWeb && !USE_LOCAL_API ? WEB_PROXIED_ORIGIN : API_ORIGIN);

/**
 * Origin the customer-facing QR ordering page is served from (see backend
 * PublicOrderPageController) — same host as the API, no "/api" suffix. Deliberately NOT
 * routed through the web proxy: this is a link a guest's phone opens as its own page load
 * (QR scan, WhatsApp share), never an XHR from the staff-facing app, so there's no cookie or
 * same-origin concern — it must stay a real, absolute, externally-reachable URL.
 */
export const getPublicOrderBaseUrl = (): string => API_ORIGIN;

/**
 * API base for links that get SENT somewhere rather than fetched — the WhatsApp bill link
 * (/public/receipt/...) is the one caller today. getApiBaseUrl() can't be used for these:
 * it's origin-less on web so XHRs stay same-origin, which is right for a fetch and useless
 * the moment the string lands in someone's WhatsApp as "/api/public/receipt/31-...".
 *
 * On web this returns the page's OWN origin rather than API_ORIGIN, because whatever serves
 * the app also forwards /api (vercel.json's rewrite in production, webpack devServer's proxy
 * locally — both verified to carry this route). Two things fall out of that. The guest sees
 * a first-party link instead of a raw onrender.com one. And, more practically, the link is
 * answered by the same API that minted the token: ReceiptTokenService signs with Jwt:Secret,
 * which differs per environment, so a locally-issued token pointed at the deployed API would
 * always 404 on a signature mismatch — which is exactly what a link built from API_ORIGIN
 * did while developing against a local backend.
 *
 * Native has no page origin and talks to the API host directly, so it keeps API_ORIGIN.
 */
export const getPublicApiBaseUrl = (): string =>
  isWeb && typeof window !== 'undefined' ? `${window.location.origin}/api` : `${API_ORIGIN}/api`;
