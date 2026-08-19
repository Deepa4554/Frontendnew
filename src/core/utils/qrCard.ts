// Named import, not default: the module is CommonJS with no __esModule marker, so a default
// import would rest on bundler interop rather than on anything the package actually exports.
// The `browser` build specifically — the package's main entry pulls in Node's fs/stream for
// its file-writing helpers, which Metro can't resolve. Nothing in this build touches the DOM
// at import time (its canvas renderer only calls document.createElement inside a function),
// so it loads fine on native too.
import { toString as qrToSvg } from 'qrcode/lib/browser';
import { savePdfFromHtml } from './fileExport';

export interface QrCardOptions {
  /** The URL the code resolves to — what a phone actually opens. */
  url: string;
  /** Printed large above the code, e.g. "Table T4" or "Order & Pay". */
  heading: string;
  /** The cafe's own name, printed above the heading. */
  businessName: string;
  /** One line under the code telling the guest what happens next. */
  instruction: string;
  /** Goes into the saved file's name — no spaces or punctuation needed from callers. */
  fileLabel: string;
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Saves a printable card carrying the QR code plus the words that make it work.
 *
 * A bare code printed on its own gets ignored — a guest has no reason to believe their camera
 * will do anything useful with it. The card states the cafe, what the code is for, and what to
 * do, which is the whole difference between a sticker people scan and one they don't.
 *
 * Rendered as a PDF rather than an image: this exists to be printed and put on a table, and a
 * PDF keeps the code crisp at any size, where a screen-resolution PNG blurs as soon as it is
 * scaled up. On web this opens the browser's print dialog (choose "Save as PDF" there); on
 * native it writes a real file and hands it to the share sheet — see savePdfFromHtml.
 *
 * The code itself is an inline SVG, generated here rather than lifted off the on-screen
 * component: nothing then has to be rasterised, and the vector prints sharp at any size.
 */
export async function downloadQrCard(options: QrCardOptions): Promise<void> {
  // Error correction M, and a quiet zone of 2 modules — a printed code gets smudged, curled
  // and photographed at an angle, and too tight a margin is what makes a scan fail.
  const svg = await qrToSvg(options.url, { type: 'svg', margin: 2, errorCorrectionLevel: 'M' });

  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>${escapeHtml(options.heading)}</title>
<style>
  @page { margin: 12mm; }
  html, body { margin: 0; padding: 0; background: #fff; }
  body {
    font-family: Helvetica, Arial, sans-serif;
    color: #2b1810;
    display: flex;
    justify-content: center;
  }
  .card {
    width: 105mm;
    border: 1.5mm solid #2b1810;
    border-radius: 6mm;
    padding: 10mm 8mm;
    text-align: center;
    box-sizing: border-box;
  }
  .business { font-size: 20pt; font-weight: bold; letter-spacing: -0.3pt; margin: 0 0 7mm; }
  /* Sized in mm, not px: the code has to be big enough to scan from across a table, and a
     pixel size would print at whatever the driver's DPI happens to be. */
  .code { width: 62mm; height: 62mm; margin: 0 auto; }
  .code svg { width: 100%; height: 100%; display: block; }
  /* Directly under the code, and the largest thing on the card after the cafe's own name:
     someone glancing at a table tent reads the code's purpose here or not at all. */
  .heading {
    font-size: 16pt; font-weight: bold; letter-spacing: 2pt; text-transform: uppercase;
    color: #c5652e; margin: 6mm 0 0;
  }
  .table-label { font-size: 13pt; font-weight: bold; margin: 3mm 0 2mm; }
  .instruction { font-size: 10pt; color: #6b5b52; margin: 0; line-height: 1.4; }
</style>
</head>
<body>
  <div class="card">
    <p class="business">${escapeHtml(options.businessName)}</p>
    <div class="code">${svg}</div>
    <p class="heading">Scan to Order</p>
    <p class="table-label">${escapeHtml(options.heading)}</p>
    <p class="instruction">${escapeHtml(options.instruction)}</p>
  </div>
</body>
</html>`;

  const slug = options.fileLabel.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '') || 'QR';
  await savePdfFromHtml(`${slug}-QR.pdf`, html);
}
