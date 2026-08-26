import { getItem, setItem, removeItem } from '../storage/mmkv';

/** 'browser' hands the receipt to the browser's own print dialog, and through it to whatever
 * printer the OS has a driver for — the only way to reach a USB printer, which neither of the
 * other two can (see BrowserPrinter.web.ts). Web build only. */
export type PrinterType = 'none' | 'wifi' | 'bluetooth' | 'browser';

export interface PrinterConfig {
  type: PrinterType;
  wifiIp?: string;
  wifiPort?: number;
  bluetoothAddress?: string;
  bluetoothName?: string;
  /** 32 for 58mm printers (most common in small cafes), 48 for 80mm. */
  columns?: number;
  /** Windows printer name (as it appears in Devices and Printers, e.g. "POS-58") to send raw
   * ESC/POS bytes to via PrintAgent (see UsbAgentPrinter.web.ts) instead of opening the HTML
   * print dialog. Only meaningful when type is 'browser'; unset means "no local agent set up,
   * use the dialog" — PrinterService tries the agent first when this is set and falls back to
   * the dialog if the agent isn't reachable, so a till with the agent stopped still prints. */
  usbAgentPrinterName?: string;
}

const STORAGE_KEY = 'printer_config';

/** Printer is a per-device/terminal setting (each till may have a different printer
 * plugged in), so this lives in local device storage, not the backend. */
export const getPrinterConfig = (): PrinterConfig => {
  const raw = getItem(STORAGE_KEY);
  if (!raw) return { type: 'none' };
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && typeof parsed.type === 'string') return parsed;
  } catch {
    // Malformed JSON — fall through to the default below.
  }
  return { type: 'none' };
};

export const savePrinterConfig = (config: PrinterConfig) => {
  setItem(STORAGE_KEY, JSON.stringify(config));
};

export const clearPrinterConfig = () => {
  removeItem(STORAGE_KEY);
};

const STATION_STORAGE_KEY = 'printer_configs_by_station';

const readStationConfigs = (): Record<string, PrinterConfig> => {
  const raw = getItem(STATION_STORAGE_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

/** A station's own printer, if this device has one configured for it — null means "use
 * this device's default printer instead" (see getEffectivePrinterConfig). Per-device
 * local storage, same reasoning as getPrinterConfig: a till only knows about the
 * printer(s) physically reachable from it. */
export const getStationPrinterConfig = (stationName: string): PrinterConfig | null =>
  readStationConfigs()[stationName] ?? null;

export const saveStationPrinterConfig = (stationName: string, config: PrinterConfig) => {
  const all = readStationConfigs();
  all[stationName] = config;
  setItem(STATION_STORAGE_KEY, JSON.stringify(all));
};

export const clearStationPrinterConfig = (stationName: string) => {
  const all = readStationConfigs();
  delete all[stationName];
  setItem(STATION_STORAGE_KEY, JSON.stringify(all));
};

/** The name a Bluetooth printer was saved under, looked up by address across this device's
 * default printer and every per-station one. The web build needs it to recognise a printer the
 * browser hands back under a freshly minted id — see BluetoothPrinter.web.ts's
 * findPermittedDevice, where an address that no longer matches is the normal case after the
 * browser has been closed and reopened. */
export const findSavedPrinterName = (address: string): string | undefined => {
  const all: PrinterConfig[] = [getPrinterConfig(), ...Object.values(readStationConfigs())];
  return all.find((c) => c.bluetoothAddress === address)?.bluetoothName;
};

/** Whether this device has anything to print to at all — its own default printer, or at
 * least one station's. Used to decide whether this device should even look at auto-print
 * work (see AutoKotPrintHost): a till with nothing configured has no business claiming a
 * batch or surfacing a "no printer set up" toast for an order it was never going to print. */
export const hasAnyPrinterConfigured = (): boolean => {
  if (getPrinterConfig().type !== 'none') return true;
  return Object.values(readStationConfigs()).some((c) => c.type !== 'none');
};

const AUTO_PRINT_HOST_KEY = 'auto_print_host';

/** Whether THIS device should auto-print every fired kitchen ticket it sees, not just its own
 * (see AutoKotPrintHost). Off by default: a cafe with printers set up on more than one device
 * would otherwise get every order printed on all of them at once. Turn it on for exactly the
 * device(s) meant to catch orders fired from elsewhere — a phone that never leaves the counter
 * next to the printer, for instance. */
export const isAutoPrintHost = (): boolean => getItem(AUTO_PRINT_HOST_KEY) === 'true';

export const setAutoPrintHost = (enabled: boolean) => setItem(AUTO_PRINT_HOST_KEY, String(enabled));

/** Resolves which printer a KOT line for `stationName` should route to: that station's
 * own printer if this device has one configured, otherwise this device's default
 * printer (getPrinterConfig()) — so a cafe that never sets up per-station printers keeps
 * behaving exactly as it did before stations existed. */
export const getEffectivePrinterConfig = (stationName?: string | null): PrinterConfig => {
  if (stationName) {
    const stationConfig = getStationPrinterConfig(stationName);
    // A station row of type 'none' is "this station has no printer of its own", which is the
    // same thing as having no row at all — so it falls through to the device's printer rather
    // than overriding it. Testing only for the row's existence is what let a station saved as
    // 'none' silently outrank a perfectly good till printer: the KOT reported "No printer set
    // up yet" while Test Print, which never consults a station, worked fine.
    //
    // Read-side as well as write-side (see PrinterSettingsScreen.save, which now clears the row
    // instead of writing 'none') because the bad rows are already saved on real tills. Fixing
    // only the write would leave those stuck until someone thought to clear browser storage.
    if (stationConfig && stationConfig.type !== 'none') return stationConfig;
  }
  return getPrinterConfig();
};
