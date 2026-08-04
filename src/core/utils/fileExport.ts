import { Platform } from 'react-native';
import RNFS from 'react-native-fs';
import Share from 'react-native-share';
import { generatePDF } from 'react-native-html-to-pdf';

/**
 * Saving files that are BUILT on the client (dashboard reports), as opposed to
 * downloaded from the API — that's fileDownload.ts's downloadAndShare.
 *
 * react-native-fs / react-native-share / react-native-html-to-pdf are all stubbed to
 * reject on web (see web/mocks/), so every native path here is behind a Platform check
 * and web gets a browser-native equivalent instead: an anchor download for binary
 * files, and print-to-PDF for PDFs (browsers have no PDF writer to call, but every
 * one of them can render HTML to PDF through the print dialog).
 */

const base64ToBlob = (base64: string, mimeType: string): Blob => {
  const binary = (globalThis as any).atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mimeType });
};

const downloadBlob = (blob: Blob, fileName: string) => {
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
};

/**
 * Renders `html` in an offscreen iframe and opens the browser's print dialog on it,
 * where "Save as PDF" is a built-in destination. A same-origin about:blank frame keeps
 * this inside the page's `default-src 'self'` CSP (a blob: or data: frame would not),
 * and printing the frame rather than the page itself leaves the app's own DOM alone.
 */
const printHtmlOnWeb = (html: string) => {
  const doc = (globalThis as any).document;
  const frame = doc.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
  doc.body.appendChild(frame);

  const frameWin = frame.contentWindow;
  if (!frameWin) {
    doc.body.removeChild(frame);
    throw new Error('This browser blocked the print view needed to build the PDF.');
  }

  frameWin.document.open();
  frameWin.document.write(html);
  frameWin.document.close();

  let cleanedUp = false;
  const cleanup = () => {
    if (cleanedUp) return;
    cleanedUp = true;
    if (frame.parentNode) frame.parentNode.removeChild(frame);
  };
  // Removing the frame while the dialog is still open cancels the print in Chrome, so
  // cleanup waits for onafterprint — with a timer as backstop for the browsers that
  // never fire it (and for a dialog the user simply leaves open).
  frameWin.onafterprint = cleanup;
  setTimeout(cleanup, 120000);

  // document.write'd content is parsed synchronously, but fonts/layout settle a tick
  // later; printing immediately can capture a half-laid-out page.
  setTimeout(() => {
    frameWin.focus();
    frameWin.print();
  }, 250);
};

/**
 * Writes a base64 payload to a real file and hands it to the share sheet (native) or
 * the browser's downloads (web).
 */
export async function saveBinaryFile(fileName: string, mimeType: string, base64: string): Promise<void> {
  if (Platform.OS === 'web') {
    downloadBlob(base64ToBlob(base64, mimeType), fileName);
    return;
  }

  const filePath = `${RNFS.DocumentDirectoryPath}/${fileName}`;
  await RNFS.writeFile(filePath, base64, 'base64');
  await Share.open({ url: `file://${filePath}`, type: mimeType, title: fileName });
}

/**
 * Turns an HTML document into a PDF: a real file plus share sheet on native, the
 * print-to-PDF dialog on web.
 */
export async function savePdfFromHtml(fileName: string, html: string): Promise<void> {
  if (Platform.OS === 'web') {
    printHtmlOnWeb(html);
    return;
  }

  // The native module appends its own ".pdf".
  const file = await generatePDF({ html, fileName: fileName.replace(/\.pdf$/i, ''), directory: 'Documents' });
  if (!file?.filePath) throw new Error('The PDF could not be generated on this device.');

  await Share.open({ url: `file://${file.filePath}`, type: 'application/pdf', title: fileName });
}
