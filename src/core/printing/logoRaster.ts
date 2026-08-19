import { apiClient } from '../network/api';

/**
 * The cafe's logo, already decoded/resized/dithered into ESC/POS raster print bytes — see
 * SettingsController.GetThermalLogo and ThermalLogoRasterizer on the backend for why that work
 * happens there and not here: it's real image processing (JPEG decode, resize, Floyd–Steinberg
 * dithering), and this app has no image library for it on native. This module's only job is
 * fetching those bytes once per paper width and holding onto them for the rest of the session.
 *
 * Session-only cache, deliberately: same reasoning as printedKots.ts. A logo changes at most
 * once in a great while (Cafe Profile screen), and every print already goes through one
 * request-per-print anyway — refetching on every single receipt would be a pointless network
 * round trip in the middle of the print path a cashier is standing there waiting on. A reload
 * (or a fresh cache entry after an error) picks up any change.
 */
const cache = new Map<number, Uint8Array | null>();

/**
 * Bytes for a 32- or 48-column paper, or null if this cafe has no usable logo (never set, or
 * its host is unreachable — see CafeLogoLoader). Failures are cached as null too, not retried
 * every print: a logo host that's down stays down for more than one receipt, and a bill must
 * never be held up waiting on it.
 */
/** Test seam — same convention as serverClock.ts's __resetServerClock. */
export const __resetLogoRasterCache = (): void => {
  cache.clear();
};

export async function getLogoRaster(columns: number): Promise<Uint8Array | null> {
  if (cache.has(columns)) return cache.get(columns)!;

  try {
    const res = await apiClient.get<ArrayBuffer>('/settings/logo/thermal', {
      params: { columns },
      responseType: 'arraybuffer',
      // Never let a slow logo host hold up the receipt behind it — same 3s budget the
      // backend gives itself fetching the source image (see CafeLogoLoader.FetchTimeout).
      timeout: 3000,
    });
    const bytes = res.data.byteLength > 0 ? new Uint8Array(res.data) : null;
    cache.set(columns, bytes);
    return bytes;
  } catch {
    cache.set(columns, null);
    return null;
  }
}
