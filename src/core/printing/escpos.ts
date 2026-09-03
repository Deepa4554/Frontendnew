/**
 * Renders the shared receipt line model (see receiptFormat.ts) to a raw ESC/POS
 * command byte stream. Used by the WiFi transport: the backend relay (PrintController)
 * doesn't understand receipts, just forwards whatever bytes it's given straight to the
 * printer's TCP socket, so all the formatting has to happen here on the client first.
 *
 * Text is kept ASCII-only (₹ becomes "Rs.", handled upstream in receiptFormat.ts) since
 * a printer's built-in codepage usually can't render arbitrary Unicode.
 */
import { ReceiptLine } from './receiptFormat';

const ESC = 0x1b;
const GS = 0x1d;

const CMD = {
  INIT: [ESC, 0x40],
  // Deliberately no font selection: everything prints at the printer's default Font A
  // (12x24 dots, 32 characters on a 58mm head). Font B (ESC M 1) was tried — 9x17 dots, 42
  // characters, enough for a long item name and its price to share a line — and reverted:
  // a third fewer dots per glyph prints visibly fainter, which on a unit with a low battery,
  // a low density setting or a worn head is the difference between a light slip and a blank
  // one. Legibility on real hardware beats fitting more in. Long lines are handled by
  // wrapping them instead (see wrapToWidth in receiptFormat.ts).
  ALIGN_LEFT: [ESC, 0x61, 0x00],
  ALIGN_CENTER: [ESC, 0x61, 0x01],
  BOLD_ON: [ESC, 0x45, 0x01],
  BOLD_OFF: [ESC, 0x45, 0x00],
  // Emphasis for a `big` line comes in two strengths, picked per line by renderLine.
  //
  // WIDE (height + width) is what a heading wants — the cafe name on a bill, a token number —
  // but it halves how many characters fit, and every line is composed against the full
  // `columns`. A long line printed WIDE therefore ran off the paper and continued on the next
  // one mid-word: a real 58mm KOT printed "1x Chicken Birya" / "ni". So renderLine only
  // uses WIDE when the text genuinely fits in half the width, and falls back to TALL (double
  // height, normal width) otherwise — still clearly emphasised, still honest about columns.
  TALL_ON: [GS, 0x21, 0x01],
  WIDE_ON: [GS, 0x21, 0x11],
  SIZE_OFF: [GS, 0x21, 0x00],
  FEED: (lines: number) => [ESC, 0x64, lines],
  CUT: [GS, 0x56, 0x00],
};

const toAscii = (s: string) =>
  s
    .replace(/₹/g, 'Rs.')
    .replace(/[^\x00-\x7E\n]/g, '?'); // anything else non-ASCII the printer likely can't render

class ByteBuilder {
  private bytes: number[] = [];

  push(...codes: number[]) {
    this.bytes.push(...codes);
    return this;
  }

  line(s = '') {
    for (const ch of toAscii(s)) this.bytes.push(ch.charCodeAt(0));
    this.bytes.push(0x0a);
    return this;
  }

  toBytes(): Uint8Array {
    return new Uint8Array(this.bytes);
  }
}

/**
 * Standard ESC/POS "GS ( k" QR sequence (Epson TM/most clone thermal printers): select
 * model -> set module size -> set error-correction level -> store the data -> print the
 * stored symbol. `data` is expected to already be a plain-ASCII URL (the wa.me deep link),
 * so no toAscii() pass is needed here the way text lines get one.
 */
function qrCommand(data: string, moduleSize: number): number[] {
  const dataBytes = Array.from(data, (ch) => ch.charCodeAt(0) & 0xff);
  const storeLen = dataBytes.length + 3; // cn + fn + m + data
  const clampedSize = Math.min(16, Math.max(1, moduleSize));

  return [
    // Select model 2.
    GS, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00,
    // Set module size.
    GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, clampedSize,
    // Set error-correction level M.
    GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x31,
    // Store the data.
    GS, 0x28, 0x6b, storeLen & 0xff, (storeLen >> 8) & 0xff, 0x31, 0x50, 0x30, ...dataBytes,
    // Print the stored symbol.
    GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30,
  ];
}

function renderLine(b: ByteBuilder, line: ReceiptLine, columns: number) {
  switch (line.kind) {
    case 'dashes':
      b.line('-'.repeat(columns));
      return;
    case 'feed':
      b.push(...CMD.FEED(1));
      return;
    case 'text': {
      b.push(...(line.align === 'center' ? CMD.ALIGN_CENTER : CMD.ALIGN_LEFT));
      if (line.bold) b.push(...CMD.BOLD_ON);
      // Double-width only where it still fits — see CMD.WIDE_ON.
      if (line.big) b.push(...(line.text.length * 2 <= columns ? CMD.WIDE_ON : CMD.TALL_ON));
      b.line(line.text);
      if (line.big) b.push(...CMD.SIZE_OFF);
      if (line.bold) b.push(...CMD.BOLD_OFF);
      return;
    }
    case 'qr': {
      b.push(...CMD.ALIGN_CENTER);
      b.push(...qrCommand(line.data, line.size ?? 6));
      // "Print the stored symbol" leaves the position at the end of the symbol rather than at
      // the start of the next line, so without this feed whatever follows can be drawn tight
      // against the QR's bottom edge — eating the quiet zone the code needs to be readable.
      b.push(0x0a);
      b.push(...CMD.ALIGN_LEFT);
      return;
    }
    case 'image': {
      // No raster bytes means either this cafe has no logo, or (on the 'browser' transport,
      // which never fetches one) the caller only supplied previewUrl — either way, nothing
      // for THIS renderer to do; escpos.ts never touches previewUrl.
      if (!line.escposBytes) return;
      // Already the complete "GS v 0" command (header + packed bitmap) built server-side —
      // see ThermalLogoRasterizer.cs — so it's written out verbatim, the same way
      // qrCommand's bytes are, just not composed here.
      b.push(...CMD.ALIGN_CENTER);
      b.push(...Array.from(line.escposBytes));
      b.push(...CMD.ALIGN_LEFT);
      return;
    }
  }
}

/** Renders any already-built line model (a bill via buildReceiptLines, or a kitchen
 * ticket via buildKotLines — see receiptFormat.ts) to raw ESC/POS bytes. */
export function buildEscPosFromLines(lines: ReceiptLine[], columns = 32): Uint8Array {
  const b = new ByteBuilder();
  b.push(...CMD.INIT);
  for (const line of lines) renderLine(b, line, columns);
  b.push(...CMD.ALIGN_LEFT);
  // GS V 0 cuts wherever the paper happens to be, and the blade sits 15-25mm past the head on
  // the units these slips print on, so the feed before it has to cover that gap or the cut
  // lands back inside the last thing printed. Three lines is about 12.7mm — under the gap on
  // every one of them. It went unnoticed while the slip ended in text, where clipping the
  // final blank line costs nothing; the review QR made it visible, being both the last element
  // and the one element that stops working when its bottom edge is missing.
  b.push(...CMD.FEED(5));
  b.push(...CMD.CUT);
  return b.toBytes();
}

const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/**
 * Base64-encodes ESC/POS bytes for transport over JSON (used by the WiFi relay call).
 * Hand-rolled rather than relying on `btoa` — Hermes (React Native's JS engine) doesn't
 * ship it, and this needs to work identically on both native and web without a polyfill.
 */
export function escPosToBase64(bytes: Uint8Array): string {
  let result = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : undefined;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : undefined;

    result += BASE64_CHARS[b0 >> 2];
    result += BASE64_CHARS[((b0 & 0x03) << 4) | (b1 === undefined ? 0 : b1 >> 4)];
    result += b1 === undefined ? '=' : BASE64_CHARS[((b1 & 0x0f) << 2) | (b2 === undefined ? 0 : b2 >> 6)];
    result += b2 === undefined ? '=' : BASE64_CHARS[b2 & 0x3f];
  }
  return result;
}

export type { PrintableReceipt, PrintableReceiptItem } from './receiptFormat';
