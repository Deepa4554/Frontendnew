/// <reference lib="dom" />
// The RN TypeScript config deliberately omits the DOM lib (see pushNotifications.web.ts for
// the same note) — this file is web-only, so it layers the browser globals back in just for
// itself. Web Bluetooth itself still isn't in lib.dom, hence the local typings below.
/**
 * Web build of BluetoothPrinter — drives a BLE thermal printer straight from the browser
 * over Web Bluetooth, so a till running the web app on an Android tablet can print without
 * installing the native app. Resolved automatically by webpack's `.web.ts`-first extension
 * priority (see webpack.config.js); BluetoothPrinter.ts (the react-native-thermal-receipt-printer
 * implementation) is what native builds get.
 *
 * The browser constraints this has to live inside, and why the code looks the way it does:
 *  - Chrome/Edge on Android and desktop only. iOS Safari and Firefox ship no Web Bluetooth
 *    at all, so isSupported() is false there and Printer Settings says so instead of failing
 *    at print time.
 *  - HTTPS (or localhost) only — navigator.bluetooth simply isn't defined on an insecure
 *    origin, which is exactly what isSupported() ends up reporting.
 *  - BLE only. Bluetooth Classic / SPP printers (still common on cheap 58mm units) are
 *    unreachable from any browser; those need the native app or a WiFi printer.
 *  - There is no API to list the devices the OS has already paired. requestDevice() opens
 *    Chrome's own chooser and needs a user gesture, so "scan" here means "open the chooser"
 *    and returns the single device the user picked.
 *  - A device handle can't survive a page reload (navigator.bluetooth.getDevices() would,
 *    but it's still behind chrome://flags/#enable-web-bluetooth-new-permissions-backend), so
 *    connect() re-opens the chooser once per reload — see the pairedDevice comments below.
 *
 * NOTE: like the native implementation, this can only really be verified against a real BLE
 * printer — it has not been tested against actual hardware from this environment.
 */
import { ReceiptLine } from './receiptFormat';
import { buildEscPosFromLines } from './escpos';

export interface BluetoothPrinterDevice {
  /** Web Bluetooth's per-origin opaque device id, NOT a MAC address (browsers never expose
   * one). Stable for this origin until the user clears site data, which is enough for
   * printerConfig to recognise the saved printer on a later visit — the field is called
   * `bluetoothAddress` there because native builds do store a real MAC. */
  address: string;
  name: string;
}

// --- Minimal Web Bluetooth typings ------------------------------------------------------
// @types/web-bluetooth isn't a dependency, and tsconfig pins `types: ["jest"]` so an ambient
// package wouldn't be picked up anyway — only the surface used below is declared, module-scoped.
interface BtCharacteristic {
  uuid: string;
  properties: { write: boolean; writeWithoutResponse: boolean };
  writeValue(value: BufferSource): Promise<void>;
  writeValueWithResponse?(value: BufferSource): Promise<void>;
  writeValueWithoutResponse?(value: BufferSource): Promise<void>;
}
interface BtService {
  uuid: string;
  getCharacteristics(): Promise<BtCharacteristic[]>;
}
interface BtServer {
  connected: boolean;
  connect(): Promise<BtServer>;
  getPrimaryServices(): Promise<BtService[]>;
}
interface BtDevice extends EventTarget {
  id: string;
  name?: string;
  gatt?: BtServer;
}
interface BtApi {
  requestDevice(options: { acceptAllDevices?: boolean; optionalServices?: string[] }): Promise<BtDevice>;
  /** Devices this origin already has permission for. Flag-gated in current Chrome, so every
   * call site treats it as optional rather than depending on it. */
  getDevices?(): Promise<BtDevice[]>;
}

/**
 * GATT services BLE thermal printers actually expose. Web Bluetooth refuses to hand back any
 * service that wasn't declared up front in requestDevice's optionalServices, so a printer whose
 * service isn't listed here connects but has nothing writable — if a customer's printer lands in
 * that case, its service UUID goes in this list.
 */
const PRINTER_SERVICES = [
  '000018f0-0000-1000-8000-00805f9b34fb', // generic ESC/POS BLE modules (write characteristic 00002af1-…)
  '0000ffe0-0000-1000-8000-00805f9b34fb', // HM-10 / CC254x serial bridge (ffe1)
  '0000ff00-0000-1000-8000-00805f9b34fb', // widespread clone firmware (ff02)
  '0000ae30-0000-1000-8000-00805f9b34fb', // Zjiang / some Goojprt units (ae01)
  '49535343-fe7d-4ae5-8fa9-9fafd205e455', // Microchip/ISSC transparent UART (…8841…)
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2', // Nordic-style UART used by a few Star/Epson clones
];

/** 23-byte default BLE MTU minus the 3-byte ATT header — the one payload size every stack
 * accepts without negotiating. */
const CHUNK_SIZE = 20;
/** Thermal printers have a few hundred bytes of buffer and silently drop whatever overflows,
 * and writeValueWithoutResponse returns before the printer has actually consumed anything —
 * so unacknowledged writes get paced by hand. Acknowledged writes pace themselves. */
const CHUNK_DELAY_MS = 20;

const NO_SUPPORT_MESSAGE =
  'This browser can’t do Bluetooth. Use Chrome on Android (over https), a WiFi/LAN printer, or the mobile app.';
const RE_PICK_MESSAGE =
  'The browser forgets the printer when the page reloads. Open Printer Settings, tap Scan, pick your printer, then print again.';

const bluetoothApi = (): BtApi | undefined =>
  typeof navigator === 'undefined' ? undefined : (navigator as Navigator & { bluetooth?: BtApi }).bluetooth;

/** The device the user picked in this page load. Survives the printer being switched off and
 * back on (gatt.connect() needs no gesture), but not a reload — see the file header. */
let pairedDevice: BtDevice | null = null;
let writeCharacteristic: BtCharacteristic | null = null;
const disconnectHandlerAttached = new WeakSet<BtDevice>();

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function remember(device: BtDevice) {
  pairedDevice = device;
  writeCharacteristic = null;
  if (!disconnectHandlerAttached.has(device)) {
    // The characteristic handle goes stale the moment GATT drops (printer powered off, out of
    // range), and writing to a stale one throws something opaque — drop it so the next print
    // re-discovers instead.
    device.addEventListener('gattserverdisconnected', () => {
      writeCharacteristic = null;
    });
    disconnectHandlerAttached.add(device);
  }
}

/** Opens Chrome's device chooser. Resolves null when the user dismisses it (or the chooser
 * found nothing) — that's a normal outcome here, not an error worth a red toast. */
async function pickDevice(): Promise<BtDevice | null> {
  const bt = bluetoothApi();
  if (!bt) throw new Error(NO_SUPPORT_MESSAGE);
  try {
    // acceptAllDevices rather than filtering on PRINTER_SERVICES: a lot of thermal printers
    // advertise nothing but a name, so filtering by service would hide the very devices being
    // looked for. The chooser is the user's own filter.
    const device = await bt.requestDevice({ acceptAllDevices: true, optionalServices: PRINTER_SERVICES });
    remember(device);
    return device;
  } catch (err) {
    if ((err as { name?: string })?.name === 'NotFoundError') return null;
    throw err;
  }
}

/** Chrome can hand back an already-permitted device without a chooser, which would make print
 * work straight after a reload — but only with the new-permissions-backend flag on. Absent or
 * failing, this just returns null and the caller falls back to prompting. */
async function findPermittedDevice(address: string): Promise<BtDevice | null> {
  const bt = bluetoothApi();
  if (!bt?.getDevices) return null;
  try {
    const devices = await bt.getDevices();
    return devices.find((d) => d.id === address) ?? null;
  } catch {
    return null;
  }
}

async function findWriteCharacteristic(server: BtServer): Promise<BtCharacteristic> {
  const services = await server.getPrimaryServices().catch(() => [] as BtService[]);
  for (const service of services) {
    const characteristics = await service.getCharacteristics().catch(() => [] as BtCharacteristic[]);
    // Whichever channel accepts bytes is the print channel — these modules expose exactly one
    // writable characteristic, so there's nothing to disambiguate between.
    const writable = characteristics.find((c) => c.properties.writeWithoutResponse || c.properties.write);
    if (writable) return writable;
  }
  throw new Error(
    'Connected, but this device has no printable Bluetooth channel. It’s likely a Bluetooth Classic printer, which browsers can’t talk to — print over WiFi or use the mobile app.',
  );
}

async function writeBytes(bytes: Uint8Array, characteristic: BtCharacteristic) {
  const unacknowledged = characteristic.properties.writeWithoutResponse && !!characteristic.writeValueWithoutResponse;
  for (let offset = 0; offset < bytes.length; offset += CHUNK_SIZE) {
    const chunk = bytes.slice(offset, offset + CHUNK_SIZE);
    if (unacknowledged) {
      await characteristic.writeValueWithoutResponse!(chunk);
      await delay(CHUNK_DELAY_MS);
    } else if (characteristic.writeValueWithResponse) {
      await characteristic.writeValueWithResponse(chunk);
    } else {
      await characteristic.writeValue(chunk);
    }
  }
}

export const BluetoothPrinter = {
  /** navigator.bluetooth is [SecureContext]-gated, so this single check covers both "browser
   * has no Web Bluetooth" (Safari, Firefox) and "page isn't on https". */
  isSupported: () => !!bluetoothApi(),

  /** True: this path writes raw ESC/POS itself (see printLines below), so buildEscPosFromLines
   * selects Font B and lines can be composed at the wider Font-B width. See PrinterService's
   * columnsFor(), and BluetoothPrinter.ts for why the native path can't do the same. */
  printsCompactFont: true,

  /** Opens the chooser and returns the one device the user picked, or [] if they dismissed it.
   * Unlike the native implementation this can't enumerate paired devices — see the file header. */
  async scanDevices(): Promise<BluetoothPrinterDevice[]> {
    const device = await pickDevice();
    if (!device) return [];
    return [{ address: device.id, name: device.name || 'Bluetooth printer' }];
  },

  async connect(address: string): Promise<void> {
    if (!bluetoothApi()) throw new Error(NO_SUPPORT_MESSAGE);

    // Saved config points at a different printer than the one picked in this tab (station
    // printers, or the user re-scanned) — drop the stale handle and re-resolve.
    if (pairedDevice && pairedDevice.id !== address) {
      pairedDevice = null;
      writeCharacteristic = null;
    }

    if (!pairedDevice) {
      const permitted = await findPermittedDevice(address);
      if (permitted) remember(permitted);
    }

    if (!pairedDevice) {
      // First print of a page load: the handle is gone and only a chooser can bring it back.
      // Works while the click that started the print still counts as a user gesture; once that
      // has expired Chrome throws SecurityError/NotAllowedError, turned into RE_PICK_MESSAGE
      // below so the cashier gets an instruction rather than a DOMException. Whatever they pick
      // is used even if its id differs from `address` — they just chose it, deliberately.
      let picked: BtDevice | null;
      try {
        picked = await pickDevice();
      } catch (err) {
        const name = (err as { name?: string })?.name;
        if (name === 'SecurityError' || name === 'NotAllowedError') throw new Error(RE_PICK_MESSAGE);
        throw err;
      }
      if (!picked) throw new Error('No printer selected. Tap Scan in Printer Settings and pick your printer.');
    }

    const device = pairedDevice as BtDevice;
    if (!device.gatt) {
      throw new Error('That device doesn’t expose a Bluetooth connection — pick the printer itself, not a phone or a headset.');
    }
    if (!device.gatt.connected) {
      writeCharacteristic = null;
      await device.gatt.connect();
    }
    if (!writeCharacteristic) writeCharacteristic = await findWriteCharacteristic(device.gatt);
  },

  /** Renders straight to ESC/POS bytes rather than the native build's tagged markup (that
   * markup only means anything to react-native-thermal-receipt-printer, which does its own
   * encoding) — so the web path also prints real QR codes instead of the text stand-in
   * blePrinterMarkup.ts has to fall back to. Call connect() first; PrinterService always does. */
  async printLines(lines: ReceiptLine[], columns: number): Promise<void> {
    if (!writeCharacteristic) throw new Error('Printer isn’t connected. Tap Scan in Printer Settings and pick your printer.');
    await writeBytes(buildEscPosFromLines(lines, columns), writeCharacteristic);
  },
};
