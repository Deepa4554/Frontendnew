/**
 * Renders the shared receipt line model (see receiptFormat.ts) to the `<C>`/`<CB>`
 * tagged-text markup that react-native-thermal-receipt-printer's BLEPrinter.printBill()
 * expects (see node_modules/react-native-thermal-receipt-printer/README.md — it does
 * its own ESC/POS encoding internally, so this only needs to describe alignment/size,
 * not raw printer commands).
 */
import { ReceiptLine, toPrinterAscii } from './receiptFormat';

/** Renders any already-built line model (a bill via buildReceiptLines, or a kitchen
 * ticket via buildKotLines — see receiptFormat.ts) to BLEPrinter's tagged-text markup. */
export function buildMarkupFromLines(lines: ReceiptLine[], columns = 32): string {
  const parts: string[] = [];
  for (const line of lines) {
    if (line.kind === 'feed') {
      parts.push('');
      continue;
    }
    if (line.kind === 'image') {
      // react-native-thermal-receipt-printer's BLEPrinter exposes no image/raster command at
      // all (only printText/printBill markup — see node_modules/.../dist/index.d.ts), unlike
      // the WiFi and Web Bluetooth transports which both send raw ESC/POS bytes and so CAN
      // print the logo (see escpos.ts). Dropping the line is the honest option here: there is
      // no markup tag to fall back to the way 'qr' does, and a bill with everything except a
      // missing logo band is a far smaller problem than one that doesn't print at all.
      continue;
    }
    if (line.kind === 'qr') {
      // react-native-thermal-receipt-printer's tagged-text markup has no confirmed QR
      // command — rather than silently print nothing, print the line's own plain-text
      // stand-in so whoever's holding the slip knows what they're missing and how to get it
      // (the wording differs per QR: a tracking link vs. paying the bill). The WiFi/ESC-POS
      // transport, the common setup for a printed customer slip, prints the real QR — see
      // escpos.ts.
      parts.push(`<C>${toPrinterAscii(line.fallbackText)}</C>`);
      continue;
    }
    const text = line.kind === 'dashes' ? '-'.repeat(columns) : line.text;
    if (line.kind === 'text' && line.align === 'center') {
      parts.push(line.big ? `<CB>${text}</CB>` : `<C>${text}</C>`);
    } else {
      parts.push(text);
    }
  }
  return parts.join('\n') + '\n';
}
