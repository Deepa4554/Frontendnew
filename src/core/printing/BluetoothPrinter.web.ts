/// <reference lib="dom" />
// The RN TypeScript config deliberately omits the DOM lib (see pushNotifications.web.ts for
// the same note) — this file is web-only, so it layers the browser globals back in just for
// itself. Web Bluetooth itself still isn't in lib.dom, hence the local typings below.
/**
 * Web build of BluetoothPrinter — drives a BLE thermal printer straight from the browser
 * over Web Bluetooth, so a till running the web app on a tablet can print without installing
 * the native app. Resolved automatically by webpack's `.web.ts`-first extension priority (see
 * webpack.config.js); BluetoothPrinter.ts (the react-native-thermal-receipt-printer
 * implementation) is what native builds get.
 *
 * The browser constraints this has to live inside, and why the code looks the way it does:
 *  - Chrome/Edge on Android and desktop, plus Bluefy on iPhone/iPad (a third-party WebBLE
 *    browser — Safari and Firefox ship no Web Bluetooth at all, so isSupported() is false
 *    there and Printer Settings says so instead of failing at print time).
 *  - HTTPS (or localhost) only — navigator.bluetooth simply isn't defined on an insecure
 *    origin, which is exactly what isSupported() ends up reporting.
 *  - BLE only. Bluetooth Classic / SPP printers (still common on cheap 58mm units) are
 *    unreachable from any browser; those need the native app or a WiFi printer.
 *  - There is no API to list the devices the OS has already paired. requestDevice() opens
 *    the browser's own chooser and needs a user gesture, so "scan" here means "open the
 *    chooser" and returns the single device the user picked.
 *
 * Staying connected is the other half of the job, and is why this file is more than a thin
 * wrapper. The link drops constantly in normal use — the printer gets switched off, the till
 * walks out of range, and on iOS/Bluefy merely switching apps or letting the screen sleep
 * suspends the web view and tears GATT down with it. Dropping is fine; needing the cashier to
 * re-pick the printer afterwards is not. So once a device is attached this module owns the
 * link and gets it back on its own, from all three depths of "gone":
 *  - GATT dropped, page still alive: gatt.connect() needs no user gesture, so the link is
 *    re-opened in the background on a backoff (reconnectNow/scheduleReconnect), unnoticed.
 *  - App was backgrounded: coming back re-arms that immediately, via Bluefy's own
 *    `backgroundstatechanged` event plus the standard visibilitychange/focus/pageshow.
 *  - Page was reloaded (Bluefy closed and reopened, till restarted): every JS handle is gone,
 *    but the *permission* survives, so getDevices() hands the device back without a chooser —
 *    see restoreSavedPrinter(). Bluefy has shipped getDevices() since 3.0; Chrome still hides
 *    it behind a flag, and there it degrades to the one-time Scan tap it always needed.
 *
 * NOTE: like the native implementation, this can only really be verified against a real BLE
 * printer — it has not been tested against actual hardware from this environment.
 */
import { ReceiptLine } from './receiptFormat';
import { buildEscPosFromLines } from './escpos';
import { getPrinterConfig } from './printerConfig';

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
  /** Devices this origin already has permission for — this is what survives a reload. Bluefy
   * has it (3.0+); Chrome still hides it behind a flag, so every call site treats it as
   * optional rather than depending on it. */
  getDevices?(): Promise<BtDevice[]>;
  /** Bluefy-only (iOS): fires `backgroundstatechanged` as the app leaves/re-enters the
   * foreground. Optional because navigator.bluetooth is not an EventTarget elsewhere. */
  addEventListener?(type: string, listener: () => void): void;
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

/** Waits between background reconnect attempts. Starts near-instant (the printer is usually
 * already back — the till just returned to the foreground) and backs off to a slow poll, then
 * stops: a printer that's switched off for the night shouldn't have the tab retrying all
 * night. Running out isn't final — returning to the foreground, or the next print, starts the
 * ladder again from the top. */
const RECONNECT_DELAYS_MS = [0, 500, 1500, 3000, 6000, 10000, 15000, 15000, 15000];
/** How long one attempt at bringing the link up may take before it's called a failure. Long
 * enough for a slow BLE stack to finish service discovery, short enough that the backoff
 * ladder above still means something. */
const CONNECT_TIMEOUT_MS = 10000;

const NO_SUPPORT_MESSAGE =
  'This browser can’t do Bluetooth. Use Chrome on Android (over https), Bluefy on iPhone/iPad, a WiFi/LAN printer, or the mobile app.';
const RE_PICK_MESSAGE =
  'The browser has forgotten the printer — this happens after a full page reload. Open Printer Settings, tap Scan, pick your printer, then print again.';
const NOT_A_PRINTER_MESSAGE =
  'That device doesn’t expose a Bluetooth connection — pick the printer itself, not a phone or a headset.';
const UNREACHABLE_MESSAGE =
  'The printer didn’t answer. Check it’s switched on, has paper, and is within range — then try again.';

const bluetoothApi = (): BtApi | undefined =>
  typeof navigator === 'undefined' ? undefined : (navigator as Navigator & { bluetooth?: BtApi }).bluetooth;

/** The device the user picked, and the write channel discovered on it. Both survive the
 * printer being switched off and back on (gatt.connect() needs no gesture); neither survives a
 * page reload, which is what restoreSavedPrinter() tries to paper over. */
let pairedDevice: BtDevice | null = null;
let writeCharacteristic: BtCharacteristic | null = null;
const disconnectHandlerAttached = new WeakSet<BtDevice>();

/** The printer this page is meant to stay attached to. Set once a connection has succeeded (or
 * by restoreSavedPrinter from the saved config), and it's what licenses the background
 * reconnect loop to run at all — nothing reconnects to a printer the user never chose. */
let activeAddress: string | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempt = 0;
let reconnectInFlight = false;
let listenersInstalled = false;

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Rejects `work` if it hasn't settled in time. Bringing a link up against a printer that's
 * switched off or out of range can sit unresolved indefinitely — nothing in the Web Bluetooth
 * spec bounds gatt.connect() or service discovery, and implementations differ — which would
 * pin reconnectInFlight and wedge the retry loop for good. This guarantees a failed attempt
 * always comes back so the backoff can take its next turn. */
function withTimeout<T>(work: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    work.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (err) => { clearTimeout(timer); reject(err); },
    );
  });
}

function cancelReconnect() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

/** Queues the next background attempt, or gives up once the backoff ladder is exhausted. */
function scheduleReconnect() {
  if (!activeAddress || reconnectTimer || reconnectInFlight) return;
  const wait = RECONNECT_DELAYS_MS[reconnectAttempt];
  if (wait === undefined) return;
  reconnectAttempt += 1;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    void reconnectNow();
  }, wait);
}

/** One silent attempt — never opens the chooser, since there's no user gesture out here and
 * requestDevice would only throw. Failure is the normal case (printer off, out of range), so
 * it's swallowed and re-queued rather than surfaced. */
async function reconnectNow() {
  if (!activeAddress || reconnectInFlight) return;
  if (writeCharacteristic && pairedDevice?.gatt?.connected) return;

  reconnectInFlight = true;
  let connected = false;
  try {
    if (await attachSilently(activeAddress)) {
      await openGatt();
      connected = true;
    }
  } catch {
    // Still unreachable — the backoff below decides when to look again.
  }
  reconnectInFlight = false;

  if (connected) reconnectAttempt = 0;
  else scheduleReconnect();
}

/** Something happened that makes a reconnect worth trying right now (the till came back to the
 * foreground, the page was restored from the back/forward cache). Resets the ladder so the
 * first attempt is immediate even if the previous one had backed off — or given up. */
function resumeReconnect() {
  if (!activeAddress) return;
  cancelReconnect();
  reconnectAttempt = 0;
  scheduleReconnect();
}

/**
 * Wires up every signal that says "the app might be usable again". On iOS this is the whole
 * ballgame: Bluefy's `backgroundstatechanged` is the only reliable notice that the app has
 * left or re-entered the foreground. The handler doesn't try to read a direction off the event
 * (its payload isn't specified anywhere) — it just tries to reconnect either way, because an
 * attempt made while genuinely backgrounded costs nothing: it either fails and re-queues, or
 * iOS has already suspended the timer that would have run it.
 *
 * Installed once, and only after a printer has been chosen, so a till with a WiFi printer
 * never grows these listeners.
 */
function installListeners() {
  if (listenersInstalled) return;
  listenersInstalled = true;

  bluetoothApi()?.addEventListener?.('backgroundstatechanged', resumeReconnect);

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) cancelReconnect();
      else resumeReconnect();
    });
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('focus', resumeReconnect);
    window.addEventListener('pageshow', resumeReconnect);
  }
}

function remember(device: BtDevice) {
  pairedDevice = device;
  writeCharacteristic = null;
  if (!disconnectHandlerAttached.has(device)) {
    // The characteristic handle goes stale the moment GATT drops (printer powered off, out of
    // range), and writing to a stale one throws something opaque — drop it, then start winning
    // the link back straight away so the next print finds it already up.
    device.addEventListener('gattserverdisconnected', () => {
      writeCharacteristic = null;
      resumeReconnect();
    });
    disconnectHandlerAttached.add(device);
  }
}

/** Opens the browser's device chooser. Resolves null when the user dismisses it (or the chooser
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

/** Hands back a device this origin already has permission for, with no chooser and no user
 * gesture — the one mechanism that lets a printer survive a page reload. Bluefy implements it
 * (since 3.0), which is what makes "reopen the browser and it's just connected" work on iOS;
 * Chrome needs chrome://flags/#enable-web-bluetooth-new-permissions-backend. Absent or failing,
 * this returns null and the caller falls back to prompting. */
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

/** Gets `pairedDevice` pointing at `address` without any UI: the handle already held by this
 * page load if it matches, otherwise whatever getDevices() can give back. False means only the
 * chooser can help, which needs a user gesture and so is the caller's problem. */
async function attachSilently(address: string): Promise<boolean> {
  // Saved config points at a different printer than the one attached in this tab (station
  // printers, or the user re-scanned) — drop the stale handle and re-resolve.
  if (pairedDevice && pairedDevice.id !== address) {
    pairedDevice = null;
    writeCharacteristic = null;
  }
  if (!pairedDevice) {
    const permitted = await findPermittedDevice(address);
    if (permitted) remember(permitted);
  }
  return !!pairedDevice;
}

/** Brings the already-attached `pairedDevice` up to a usable write channel, and from here on
 * this page keeps that printer alive. */
async function openGatt(): Promise<void> {
  const device = pairedDevice;
  if (!device) throw new Error(RE_PICK_MESSAGE);
  if (!device.gatt) throw new Error(NOT_A_PRINTER_MESSAGE);
  const gatt = device.gatt;

  await withTimeout(
    (async () => {
      if (!gatt.connected) {
        writeCharacteristic = null;
        await gatt.connect();
      }
      if (!writeCharacteristic) writeCharacteristic = await findWriteCharacteristic(gatt);
    })(),
    CONNECT_TIMEOUT_MS,
    UNREACHABLE_MESSAGE,
  );

  activeAddress = device.id;
  installListeners();
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

/**
 * A reload wipes every device handle this module held, so on a fresh page load the saved
 * printer is re-attached from printerConfig — silently, because there's no user gesture at
 * startup. This is the path that carries "close Bluefy, open it again, go to the site, and the
 * printer is already there": the browser kept the *permission*, so getDevices() gives the
 * device back and the backoff loop takes it from there. Where getDevices() is missing the
 * attempts fail harmlessly and the cashier taps Scan once, exactly as before.
 */
function restoreSavedPrinter() {
  const config = getPrinterConfig();
  if (config.type !== 'bluetooth' || !config.bluetoothAddress) return;
  activeAddress = config.bluetoothAddress;
  installListeners();
  resumeReconnect();
}

// Deferred by a tick so importing this module (PrinterService pulls it in at app bootstrap)
// never blocks on Bluetooth, and guarded so it's inert in Safari, on http, and under Jest.
if (typeof window !== 'undefined' && bluetoothApi()) {
  setTimeout(() => {
    try {
      restoreSavedPrinter();
    } catch {
      // Storage unreadable — the cashier can still pair by hand in Printer Settings.
    }
  }, 0);
}

export const BluetoothPrinter = {
  /** navigator.bluetooth is [SecureContext]-gated, so this single check covers both "browser
   * has no Web Bluetooth" (Safari, Firefox) and "page isn't on https". */
  isSupported: () => !!bluetoothApi(),

  /** Opens the chooser and returns the one device the user picked, or [] if they dismissed it.
   * Unlike the native implementation this can't enumerate paired devices — see the file header. */
  async scanDevices(): Promise<BluetoothPrinterDevice[]> {
    const device = await pickDevice();
    if (!device) return [];
    return [{ address: device.id, name: device.name || 'Bluetooth printer' }];
  },

  async connect(address: string): Promise<void> {
    if (!bluetoothApi()) throw new Error(NO_SUPPORT_MESSAGE);

    // A print is a fresh chance to get the link back, so it pre-empts whatever the background
    // loop had queued rather than waiting behind it.
    cancelReconnect();
    reconnectAttempt = 0;

    if (!(await attachSilently(address))) {
      // The handle is gone (first print after a reload, on a browser without getDevices) and
      // only a chooser can bring it back. Works while the click that started the print still
      // counts as a user gesture; once that has expired the browser throws
      // SecurityError/NotAllowedError, turned into RE_PICK_MESSAGE below so the cashier gets an
      // instruction rather than a DOMException. Whatever they pick is used even if its id
      // differs from `address` — they just chose it, deliberately.
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

    await openGatt();
  },

  /** Renders straight to ESC/POS bytes rather than the native build's tagged markup (that
   * markup only means anything to react-native-thermal-receipt-printer, which does its own
   * encoding) — so the web path also prints real QR codes instead of the text stand-in
   * blePrinterMarkup.ts has to fall back to. Call connect() first; PrinterService always does. */
  async printLines(lines: ReceiptLine[], columns: number): Promise<void> {
    if (!writeCharacteristic) throw new Error('Printer isn’t connected. Tap Scan in Printer Settings and pick your printer.');
    try {
      await writeBytes(buildEscPosFromLines(lines, columns), writeCharacteristic);
    } catch (err) {
      // Half-printed because the link dropped mid-receipt: the error is the cashier's to see
      // (the paper is wrong either way), but start winning the link back so the reprint works.
      resumeReconnect();
      throw err;
    }
  },
};
