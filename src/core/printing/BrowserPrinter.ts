/**
 * Native stand-in for the browser print transport (see BrowserPrinter.web.ts for the real
 * one, which webpack picks up instead via its .web.ts resolution priority).
 *
 * There is nothing to implement here: the whole point of that transport is handing a receipt
 * to the browser's print dialog, and an iOS/Android build has no such dialog to hand it to.
 * It also has no need of one — a phone or tablet has no USB printer plugged into it, which is
 * the case the web transport exists to cover.
 *
 * The type is still selectable on native because printer settings are stored per device and
 * synced by nothing: a config saved on the till could be read here. Failing with an
 * explanation beats printing nothing and saying it worked.
 */
import { ReceiptLine } from './receiptFormat';

const UNSUPPORTED_MESSAGE =
  'Browser printing only works in the web app. On this device, use a Bluetooth or WiFi printer.';

export const BrowserPrinter = {
  isSupported: () => false,

  async printLines(_lines: ReceiptLine[], _columns: number): Promise<void> {
    throw new Error(UNSUPPORTED_MESSAGE);
  },
};
