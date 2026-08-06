/**
 * Native-only Bluetooth printing via react-native-thermal-receipt-printer's BLEPrinter.
 * Resolved by Metro for real iOS/Android builds (see BluetoothPrinter.web.ts for the
 * browser build, which webpack picks up instead via its .web.ts resolution priority).
 *
 * IMPORTANT: this can only be verified on a real device with a real BLE printer paired
 * — it has not been (and can't be, from this environment) tested against actual
 * hardware. Run `pod install` (iOS) and rebuild before trying it.
 */
import { BLEPrinter } from 'react-native-thermal-receipt-printer';
import { ReceiptLine } from './receiptFormat';
import { buildMarkupFromLines } from './blePrinterMarkup';

export interface BluetoothPrinterDevice {
  address: string;
  name: string;
}

let initialized = false;
async function ensureInit() {
  if (!initialized) {
    await BLEPrinter.init();
    initialized = true;
  }
}

export const BluetoothPrinter = {
  isSupported: () => true,

  async scanDevices(): Promise<BluetoothPrinterDevice[]> {
    await ensureInit();
    const devices = await BLEPrinter.getDeviceList();
    return devices.map((d) => ({ address: d.inner_mac_address, name: d.device_name }));
  },

  async connect(address: string): Promise<void> {
    await ensureInit();
    await BLEPrinter.connectPrinter(address);
  },

  /** Rendering lives behind this call rather than in PrinterService because the two platforms
   * need different output for the same lines: BLEPrinter does its own ESC/POS encoding and
   * wants tagged markup, while the browser has to emit raw bytes (see BluetoothPrinter.web.ts). */
  async printLines(lines: ReceiptLine[], columns: number): Promise<void> {
    await BLEPrinter.printBill(buildMarkupFromLines(lines, columns));
  },
};
