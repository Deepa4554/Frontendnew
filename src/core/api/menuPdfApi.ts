import { apiClient } from '../network/api';

/** Status of the cafe's optional designed PDF menu (see backend MenuPdf / MenuPdfController).
 * `hasPdf` false means nothing is uploaded yet. When `enabled` is true, scanning the general
 * (menu-only) QR opens this PDF instead of the live digital menu. */
export interface MenuPdfStatus {
  hasPdf: boolean;
  enabled: boolean;
  fileName: string | null;
  sizeBytes: number;
  updatedAt: string | null;
}

export const menuPdfApi = {
  getStatus: () => apiClient.get<MenuPdfStatus>('/menu-pdf').then((r) => r.data),
  /** Uploads (or replaces) the menu PDF. `dataUri` is a "data:application/pdf;base64,…" string
   * from pdfPicker. A fresh upload re-enables the feature server-side. */
  upload: (dataUri: string, fileName?: string) =>
    apiClient.post<MenuPdfStatus>('/menu-pdf', { dataUri, fileName: fileName ?? null }).then((r) => r.data),
  /** Flips the general-QR-shows-PDF switch without re-uploading. */
  toggle: (enabled: boolean) =>
    apiClient.put<MenuPdfStatus>('/menu-pdf/toggle', { enabled }).then((r) => r.data),
  remove: () => apiClient.delete<MenuPdfStatus>('/menu-pdf').then((r) => r.data),
};
