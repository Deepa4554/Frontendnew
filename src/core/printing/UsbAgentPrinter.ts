/**
 * Native stand-in for PrintAgent, the local raw-USB-printing bridge (see UsbAgentPrinter.web.ts
 * for the real one, which webpack picks up instead via its .web.ts resolution priority).
 *
 * PrintAgent runs on a Windows till PC and is only ever reached from a page running in that
 * till's browser — a phone or tablet build has no USB printer plugged into it and nothing on
 * localhost to talk to, the same reasoning BrowserPrinter.ts already documents for the HTML
 * print dialog this transport is paired with.
 */
import { ReceiptLine } from './receiptFormat';

const UNSUPPORTED_MESSAGE =
  'The local print agent only works in the web app, on the till PC it is installed on.';

export const UsbAgentPrinter = {
  isSupported: () => false,

  async isAvailable(): Promise<boolean> {
    return false;
  },

  async listPrinters(): Promise<string[]> {
    throw new Error(UNSUPPORTED_MESSAGE);
  },

  async printLines(_lines: ReceiptLine[], _columns: number, _printerName: string): Promise<void> {
    throw new Error(UNSUPPORTED_MESSAGE);
  },
};
