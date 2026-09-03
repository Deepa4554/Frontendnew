/// <reference lib="dom" />
// The RN TypeScript config deliberately omits the DOM lib (see BluetoothPrinter.web.ts for
// the same note) — this file is web-only, so it layers the browser globals back in just for
// itself.
/**
 * Prints through the browser's own print dialog, against a printer the operating system
 * already has a driver for.
 *
 * This is the only transport here that can reach a USB printer at all, and it exists because
 * neither of the others can:
 *  - Bluetooth needs a BLE printer; a USB-only unit has no radio to talk to.
 *  - The WiFi/LAN relay dials the printer from the *backend* (see PrintController.cs's
 *    TcpClient), so it only works when the API is on the same network as the till. Against a
 *    cloud deployment it can never reach a printer sitting on a private LAN, whatever cable
 *    is plugged into it.
 * And a browser cannot drive a USB printer itself: once the OS installs a driver it claims
 * the device exclusively, which is exactly the case for a printer plugged into a Windows
 * till. Handing the job to the OS through the print dialog is what's left, and it works for
 * USB, LAN and shared network printers alike since the driver is the one doing the talking.
 *
 * The receipt is rendered from the same ReceiptLine model every other transport uses (see
 * receiptFormat.ts), just to HTML instead of ESC/POS bytes — so the paper says the same thing
 * no matter which printer a cafe ends up on.
 *
 * The dialog is the cost of this route: it opens on every print and someone has to confirm
 * it. That is inherent, not a gap to be closed later — a web page silently pushing paper out
 * of an OS printer is precisely what browsers refuse to allow. Chrome remembers the last
 * destination used, so in practice a cashier presses Enter.
 */
// Named, not default: the module is CommonJS with no __esModule marker, so a default import
// would rest on bundler interop rather than on anything the package actually exports.
import { toString as qrToSvg } from 'qrcode/lib/browser';
import { ReceiptLine } from './receiptFormat';

/**
 * Paper width, and the width actually printable on it, in millimetres. The two differ: a
 * "58mm" roll only images about 48mm of its width, and an "80mm" one about 72mm — the rest is
 * dead margin the head never reaches. Laying text out against the paper size instead of the
 * printable size is what pushes the right-hand column off the edge of the slip.
 */
const PAPER = {
  narrow: { paperMm: 58, printableMm: 48 },
  wide: { paperMm: 80, printableMm: 72 },
};

/**
 * Courier New's advance width, in em. Every line in the model is composed by counting
 * characters — twoCol() pads a label and an amount to exactly `columns` with literal spaces
 * (see receiptFormat.ts) — so the font has to be monospace or none of that alignment survives,
 * and its advance has to be known to turn "32 characters" into a font size. Courier New is
 * exactly 0.6em and ships on Windows and macOS both, which is why it leads the stack below.
 */
const MONO_ADVANCE_EM = 0.6;

/** Long enough for a slow machine to lay out the document, short enough that a print that is
 * never going to happen doesn't hang the caller forever. */
const LOAD_TIMEOUT_MS = 10000;
/** Backstop for removing the print frame when `afterprint` never arrives (it doesn't fire in
 * every browser). Generous — the frame is invisible and weightless, and tearing it down while
 * the dialog is still open would cancel the print. */
const CLEANUP_TIMEOUT_MS = 120000;

const NO_DOM_MESSAGE =
  'Browser printing needs a browser — on the mobile app, use a Bluetooth or WiFi printer instead.';
const NO_FRAME_MESSAGE =
  'Could not open the print view. If an extension is blocking frames on this page, allow it and try again.';

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** A QR encoded ahead of print, with the width it needs on this roll. */
interface RenderedQr {
  svg: string;
  widthMm: number;
}

/**
 * How wide to draw a QR, from its own module count rather than a fixed share of the roll.
 *
 * A 203dpi thermal head puts 8 dots in a millimetre, and a module thinner than about half a
 * millimetre (4 dots) bleeds into its neighbours until no phone can read the symbol back.
 * The size used to be a flat printableMm / 2, which is comfortable for the short link Google
 * Business hands out (`g.page/r/.../review`, 29 modules, 0.7mm each) and quietly unreadable
 * for a Google Maps URL pasted out of the address bar — those run past 200 characters, encode
 * to 65+ modules, and at that same width give each one 0.37mm. The symbol printed perfectly
 * and scanned nowhere. Since GoogleReviewLink.Normalize deliberately accepts any http(s) URL
 * (a Zomato or TripAdvisor page has the same use), the length can't be assumed short, so the
 * drawing has to follow the data.
 *
 * Floored at the old width so short links look exactly as they did, capped just under the
 * printable width so a very long one can't run off the edge of the paper.
 */
const MIN_MODULE_MM = 0.5;

function qrWidthMm(svg: string, printableMm: number): number {
  // The renderer emits `viewBox="0 0 N N"`, N being the module count INCLUDING the quiet-zone
  // margin — i.e. exactly the square that has to fit on the roll.
  const modules = Number(svg.match(/viewBox="0 0 (\d+)/)?.[1]);
  if (!Number.isFinite(modules) || modules <= 0) return printableMm / 2;
  return Math.min(Math.max(modules * MIN_MODULE_MM, printableMm / 2), printableMm * 0.9);
}

/**
 * One ReceiptLine as HTML. Mirrors escpos.ts's renderLine — including its rule about when a
 * `big` line may actually be drawn big.
 *
 * On a thermal printer `big` means double width AND double height, which halves how many
 * characters fit; escpos.ts only uses it when the text still fits in half the width and drops
 * to double-height-only otherwise, because a wide line composed against the full `columns`
 * runs off the paper mid-word ("1x Chicken Birya" / "ni" on a real 58mm KOT). The same limit
 * applies here for the same reason, but the fallback can't be the same: there is no
 * double-height-only in HTML that doesn't also change the line's width or its metrics, and
 * anything that grows the glyphs of a near-full-width line overflows the roll. So a `big`
 * line that doesn't fit doubled is emphasised with weight alone. It stays the most prominent
 * thing on the slip either way, which is all `big` is ever asked to do.
 */
function renderLine(line: ReceiptLine, columns: number, qrSvg: Map<string, RenderedQr>): string {
  switch (line.kind) {
    case 'dashes':
      return `<div>${'-'.repeat(columns)}</div>`;
    case 'feed':
      return '<div>&nbsp;</div>';
    case 'qr': {
      // Pre-rendered by buildHtml — inline SVG rather than an <img>, so there is nothing left
      // to decode by the time print() is called. A QR that failed to encode falls back to the
      // line's own plain-text stand-in, exactly as the BLE transport does (see
      // blePrinterMarkup.ts) rather than printing a blank gap.
      const qr = qrSvg.get(line.data);
      // The width is per-symbol (see qrWidthMm), so it rides on the element rather than in
      // the stylesheet; the SVG itself just fills whatever square it's given.
      return qr
        ? `<div class="qr"><span style="width:${qr.widthMm.toFixed(1)}mm">${qr.svg}</span></div>`
        : `<div class="c">${escapeHtml(line.fallbackText)}</div>`;
    }
    case 'text': {
      const classes: string[] = [];
      if (line.align === 'center') classes.push('c');
      if (line.bold) classes.push('b');
      if (line.big) classes.push(line.text.length * 2 <= columns ? 'big' : 'b');
      const attr = classes.length ? ` class="${[...new Set(classes)].join(' ')}"` : '';
      // A blank line still has to occupy one, and an empty <div> collapses to nothing.
      return `<div${attr}>${escapeHtml(line.text) || '&nbsp;'}</div>`;
    }
    case 'image': {
      // The real logo file, not the dithered escposBytes the ESC/POS transports use — the OS
      // print driver does its own halftoning for a real printer, and this frame's own iframe
      // 'load' event (see waitForLoad) already waits on it the same way it would any other
      // page image, so the dialog never opens mid-fetch. A logo host that 404s or times out
      // just leaves an empty box (no alt text) rather than failing the whole print.
      return line.previewUrl ? `<div class="logo"><img src="${escapeHtml(line.previewUrl)}" alt="" /></div>` : '';
    }
  }
}

/** The whole print document. No external stylesheet or font — the one thing it CAN still be
 * waiting on when print() fires is the cafe's own logo (an 'image' line's previewUrl, see
 * renderLine), and that's covered too: an iframe's own 'load' event only fires once every
 * referenced resource, images included, has settled (loaded or failed) — same semantics as
 * window.onload — so waitForLoad below still means what its name says. */
async function buildHtml(lines: ReceiptLine[], columns: number): Promise<string> {
  const { paperMm, printableMm } = columns >= 48 ? PAPER.wide : PAPER.narrow;
  // Turn "this many characters across the printable width" into a font size, via the known
  // advance of the monospace font above. Both standard widths land on 1.5mm per character.
  const charMm = printableMm / columns;
  const fontMm = charMm / MONO_ADVANCE_EM;
  const sideMm = (paperMm - printableMm) / 2;

  // Encoded up front, together, because renderLine has to be synchronous — and because a
  // failure here must not take the receipt down with it (see the fallback in renderLine).
  const qrSvg = new Map<string, RenderedQr>();
  for (const line of lines) {
    if (line.kind !== 'qr' || qrSvg.has(line.data)) continue;
    try {
      // margin: 4 is the quiet zone the QR spec requires on all four sides. It was 0 here,
      // on the reasoning that the paper's own margin supplies it — true to the left and
      // right, where the symbol is centred in the printable width, and false above and
      // below, where the "Scan to rate us on Google" line sits about a millimetre off the
      // top edge of the symbol. Without the zone a scanner never locks on, so the review QR
      // printed and simply didn't work.
      const svg = await qrToSvg(line.data, { type: 'svg', margin: 4, errorCorrectionLevel: 'M' });
      qrSvg.set(line.data, { svg, widthMm: qrWidthMm(svg, printableMm) });
    } catch {
      // Leave it unset — renderLine prints the plain-text stand-in instead.
    }
  }

  const body = lines.map((line) => renderLine(line, columns, qrSvg)).join('');

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Receipt</title>
<style>
  /* Chrome's default page margin is about 10mm a side, which on a 58mm roll would leave a
     third of the width for the receipt. The physical margin is applied by the body's own
     padding below instead. Page SIZE is deliberately left alone: the OS driver for a thermal
     printer already describes its roll (including continuous length), and naming a size here
     would override that with a guess. */
  @page { margin: 0; }
  html, body { margin: 0; padding: 0; background: #fff; }
  body {
    width: ${paperMm}mm;
    padding: 2mm ${sideMm}mm;
    box-sizing: border-box;
    font-family: 'Courier New', Courier, monospace;
    font-size: ${fontMm.toFixed(3)}mm;
    line-height: 1.35;
    color: #000;
    /* The line model pads with literal spaces to align its columns — collapsing whitespace
       would undo every one of them. */
    white-space: pre;
    /* Thermal output is pure black; letting the browser thin it out for "ink saving" makes a
       small monospace face hard to read on the slip. */
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  div { min-height: 1em; }
  .c { text-align: center; }
  .b { font-weight: bold; }
  .big { font-size: 2em; font-weight: bold; line-height: 1.2; }
  /* break-inside is the whole reason the review QR misprinted: it is the last element on the
     slip, and on a continuous roll the driver's page boundary fell inside it — once slicing
     the symbol off part-way down, once landing just above it so the QR went onto a page that
     never fed and the slip came out with nothing there at all. A QR is meaningless in halves,
     so it moves whole or not at all. */
  .qr { text-align: center; margin: 2mm 0; break-inside: avoid; page-break-inside: avoid; }
  .qr span { display: inline-block; }
  /* Height-capped, not width-fitted: logos are all shapes, and letting a wide banner stretch
     to the paper's own width would push the whole receipt down the roll. Matches the ESC/POS
     raster's own height cap (see ThermalLogoRasterizer.MaxHeightDots) so the logo takes
     roughly the same share of the receipt whichever transport printed it. */
  .logo { text-align: center; margin: 1mm 0; }
  .logo img { max-height: 20mm; max-width: 100%; object-fit: contain; }
  /* Sized by the wrapper, which carries a per-symbol width — see qrWidthMm. */
  .qr svg { display: block; width: 100%; height: auto; }
</style>
</head>
<body>${body}</body>
</html>`;
}

/** Resolves once the frame has laid the document out, or once it's clearly not going to. */
function waitForLoad(frame: HTMLIFrameElement): Promise<void> {
  return new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(finish, LOAD_TIMEOUT_MS);
    frame.addEventListener('load', finish, { once: true });
  });
}

export const BrowserPrinter = {
  /** True in any browser. The native builds get BrowserPrinter.ts instead, where it's false. */
  isSupported: () => typeof window !== 'undefined' && typeof document !== 'undefined',

  /**
   * Renders the lines and opens the print dialog on them.
   *
   * Deliberately an off-screen iframe rather than window.open: a popup is blocked outright
   * unless it can be traced to a user gesture (auto-printing a KOT the moment an order lands
   * never can — see AutoKotPrintHost), and it would also tear the cashier away from the till
   * screen. Printing an iframe keeps the app exactly where it was.
   *
   * Resolving means the dialog was opened, NOT that anything was printed — the browser gives
   * a page no way to learn whether the user confirmed it, picked a different printer, or hit
   * Cancel. So the toast this ends up behind can only honestly claim the former.
   */
  async printLines(lines: ReceiptLine[], columns: number): Promise<void> {
    if (!this.isSupported()) throw new Error(NO_DOM_MESSAGE);

    const html = await buildHtml(lines, columns);

    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    // Off-screen and zero-sized, but NOT display:none or visibility:hidden — a frame with no
    // layout box prints blank in some browsers.
    frame.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;border:0;';
    // srcdoc rather than document.write: same-origin, and its load event is reliable.
    frame.srcdoc = html;
    document.body.appendChild(frame);

    let cleanedUp = false;
    const cleanup = () => {
      if (cleanedUp) return;
      cleanedUp = true;
      frame.remove();
    };

    try {
      await waitForLoad(frame);

      const view = frame.contentWindow;
      if (!view) throw new Error(NO_FRAME_MESSAGE);

      // Removing the frame while the dialog is still open cancels the print, so cleanup waits
      // for afterprint — with a timer behind it because that event doesn't fire everywhere.
      view.addEventListener('afterprint', cleanup, { once: true });
      setTimeout(cleanup, CLEANUP_TIMEOUT_MS);

      // Focus first: an unfocused frame prints the parent document in some browsers.
      view.focus();
      view.print();
    } catch (err) {
      cleanup();
      throw err;
    }
  },
};
