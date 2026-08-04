/**
 * Web build of BluetoothPrinter — browsers can't do Bluetooth Classic/BLE thermal
 * printing (no cross-browser API for it, and iOS Safari has none at all), so every
 * method here just reports that clearly instead of pretending to work. Resolved
 * automatically by webpack's `.web.ts`-first extension priority (see webpack.config.js);
 * BluetoothPrinter.ts (the real native implementation) is what native builds get.
 */
export interface BluetoothPrinterDevice {
  address: string;
  name: string;
}

const unsupported = (): never => {
  throw new Error('Bluetooth printing needs the mobile app — not available in the browser. Use a WiFi/LAN printer instead, or open this on your phone.');
};

export const BluetoothPrinter = {
  isSupported: () => false,
  scanDevices: async (): Promise<BluetoothPrinterDevice[]> => unsupported(),
  connect: async (_address: string): Promise<void> => unsupported(),
  printMarkup: async (_markupText: string): Promise<void> => unsupported(),
};
