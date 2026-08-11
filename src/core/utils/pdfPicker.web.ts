import type { PickedPdf } from './pdfPicker';

export type { PickedPdf } from './pdfPicker';

/** Matches the backend cap in MenuPdfController (MaxPdfBytes). Rejecting here too gives an
 * instant, clear message instead of a round trip that fails with a generic 400. */
const MAX_PDF_BYTES = 15 * 1024 * 1024;

/**
 * Web PDF picker — opens the browser's native file dialog restricted to PDFs, reads the
 * chosen file as a "data:application/pdf;base64,…" string, and returns it with its name and
 * size. Resolves `null` if the user cancels.
 *
 * Cancel detection mirrors imagePicker.web.ts: a real `change` fires when a file is chosen; a
 * cancel leaves no reliable event in every browser, so a window-focus fallback resolves null
 * shortly after the dialog closes with nothing picked.
 */
export const pickPdfAsDataUri = (): Promise<PickedPdf | null> => {
  return new Promise((resolve, reject) => {
    const win: any = (globalThis as any).window;
    const doc: any = win.document;
    const input = doc.createElement('input');
    input.type = 'file';
    input.accept = 'application/pdf,.pdf';

    let settled = false;
    let cancelTimer: ReturnType<typeof setTimeout> | null = null;
    const finishWith = (fn: () => void) => {
      if (settled) return;
      settled = true;
      win.removeEventListener('focus', onWindowFocus);
      if (cancelTimer !== null) clearTimeout(cancelTimer);
      fn();
    };

    input.onchange = () => {
      // A genuine pick — cancel the focus-based fallback (see imagePicker.web.ts for the full
      // reasoning on why both the listener and its armed timer must be cleared here).
      win.removeEventListener('focus', onWindowFocus);
      if (cancelTimer !== null) clearTimeout(cancelTimer);

      const file = input.files?.[0];
      if (!file) {
        finishWith(() => resolve(null));
        return;
      }
      // Some browsers report an empty type for PDFs picked via ".pdf"; fall back to the
      // extension so a valid file isn't wrongly rejected.
      const looksPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name || '');
      if (!looksPdf) {
        finishWith(() => reject(new Error('Please choose a PDF file.')));
        return;
      }
      if (file.size > MAX_PDF_BYTES) {
        finishWith(() => reject(new Error(`That PDF is too large — max ${MAX_PDF_BYTES / (1024 * 1024)} MB.`)));
        return;
      }
      const reader: any = new win.FileReader();
      reader.onload = (e: any) => {
        const raw: string | undefined = e.target?.result;
        if (!raw) {
          finishWith(() => resolve(null));
          return;
        }
        finishWith(() => resolve({ dataUri: raw, fileName: file.name || 'menu.pdf', sizeBytes: file.size }));
      };
      reader.onerror = () => finishWith(() => reject(reader.error ?? new Error('Could not read that PDF.')));
      reader.readAsDataURL(file);
    };
    input.oncancel = () => finishWith(() => resolve(null));

    const onWindowFocus = () => {
      cancelTimer = setTimeout(() => finishWith(() => resolve(null)), 500);
    };
    win.addEventListener('focus', onWindowFocus, { once: true });

    input.click();
  });
};
