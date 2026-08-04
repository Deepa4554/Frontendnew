import { Platform } from 'react-native';
import RNFS from 'react-native-fs';
import Share from 'react-native-share';
import { getApiBaseUrl } from '../config/env';
import { getAccessToken } from '../storage/tokenStore';

/**
 * Downloads an authenticated server file (payslip PDF, bank/report CSV) and hands it
 * off to the platform's native share sheet on mobile, or a browser download on web.
 * `path` is relative to the API base URL, same convention as apiClient's own calls
 * (e.g. "/payroll-runs/3/lines/9/payslip.pdf").
 *
 * apiClient itself isn't used here — RNFS.downloadFile streams straight to disk on
 * native, avoiding an arraybuffer -> base64 round-trip in JS for what can be a
 * multi-page PDF, mirroring how ExportService already builds and shares files.
 */
export async function downloadAndShare(path: string, fileName: string, mimeType: string): Promise<void> {
  const url = `${getApiBaseUrl()}${path}`;

  if (Platform.OS === 'web') {
    // No token to attach here (see tokenStore.ts) — credentials: 'include' sends the
    // httpOnly access-token cookie instead, same as apiClient's withCredentials.
    const response = await fetch(url, { credentials: 'include' });
    if (!response.ok) throw new Error(`Download failed (${response.status})`);
    const blob = await response.blob();
    const win = (globalThis as any).window;
    const doc = (globalThis as any).document;
    const blobUrl = win.URL.createObjectURL(blob);
    const link = doc.createElement('a');
    link.href = blobUrl;
    link.download = fileName;
    doc.body.appendChild(link);
    link.click();
    doc.body.removeChild(link);
    win.URL.revokeObjectURL(blobUrl);
    return;
  }

  const authHeader = { Authorization: `Bearer ${getAccessToken() ?? ''}` };
  const toFile = `${RNFS.DocumentDirectoryPath}/${fileName}`;
  const { statusCode } = await RNFS.downloadFile({ fromUrl: url, toFile, headers: authHeader }).promise;
  if (statusCode !== 200) throw new Error(`Download failed (${statusCode})`);

  await Share.open({ url: `file://${toFile}`, type: mimeType, title: fileName });
}
