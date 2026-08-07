import { getPrinterConfig, getEffectivePrinterConfig, PrinterConfig } from './printerConfig';
import { buildEscPosFromLines, escPosToBase64 } from './escpos';
import { PrintableKot, PrintableKotItem, PrintableReceipt, PrintableTokenSlip, ReceiptLine, buildKotLines, buildReceiptLines, buildTokenSlipLines } from './receiptFormat';
import { printApi } from '../api/printApi';
import { BluetoothPrinter } from './BluetoothPrinter';

export interface PrintResult {
  ok: boolean;
  message: string;
}

/**
 * How many characters a line may hold on this printer — the single number every build*Lines
 * call composes against, so it has to be decided before any line exists, not at render time.
 *
 * This is simply the paper's own width (config.columns: 32 for 58mm, 48 for 80mm), because
 * every transport prints at the printer's default Font A. Selecting the narrower Font B on
 * the ESC/POS paths would fit ~42 characters instead, but it prints too faintly to rely on —
 * see the note in escpos.ts's CMD.
 */
const columnsFor = (config: PrinterConfig): number => config.columns ?? 32;

/** Routes an already-built line model to whichever printer is configured on this
 * device — WiFi goes through the backend relay (works on both mobile and web, see
 * PrintController.cs), Bluetooth talks straight to the printer: via BLEPrinter on native,
 * via Web Bluetooth in Chrome/Android (see BluetoothPrinter.web.ts for that path's browser
 * limitations). Shared by printReceipt (customer bill) and printKot (kitchen ticket) below —
 * same transports, different content. `config` defaults to this device's single global
 * printer; printKot passes a station-specific one when routing a split ticket. */
async function printLines(lines: ReceiptLine[], config: PrinterConfig = getPrinterConfig()): Promise<PrintResult> {
  const columns = columnsFor(config);

  if (config.type === 'none') {
    return { ok: false, message: 'No printer set up yet. Go to Printer Settings to add one.' };
  }

  if (config.type === 'wifi') {
    if (!config.wifiIp || !config.wifiPort) {
      return { ok: false, message: 'Printer IP/port isn\'t configured. Check Printer Settings.' };
    }
    try {
      const bytes = buildEscPosFromLines(lines, columns);
      await printApi.printWifi(config.wifiIp, config.wifiPort, escPosToBase64(bytes));
      return { ok: true, message: 'Sent to printer.' };
    } catch (err) {
      return { ok: false, message: extractErrorMessage(err) };
    }
  }

  // Bluetooth
  if (!config.bluetoothAddress) {
    return { ok: false, message: 'No Bluetooth printer paired. Check Printer Settings.' };
  }
  try {
    await BluetoothPrinter.connect(config.bluetoothAddress);
    await BluetoothPrinter.printLines(lines, columns);
    return { ok: true, message: 'Sent to printer.' };
  } catch (err) {
    return { ok: false, message: extractErrorMessage(err) };
  }
}

export const PrinterService = {
  /** Customer-facing bill — items with prices, subtotal/tax/total. Generate this once
   * the order's ready to be paid (see Token Dashboard's "Generate Bill"). `configOverride`
   * lets Printer Settings test-print against a just-edited (not yet saved) or
   * station-scoped config instead of this device's stored default. */
  printReceipt(receipt: PrintableReceipt, configOverride?: PrinterConfig): Promise<PrintResult> {
    const config = configOverride ?? getPrinterConfig();
    return printLines(buildReceiptLines(receipt, columnsFor(config)), config);
  },
  /** Kitchen ticket — items only, no prices. See Token Dashboard's "Print KOT". When the
   * order's items span more than one kitchen station (see PrintableKotItem.stationName),
   * splits into one sub-ticket per station and routes each to that station's own printer
   * (falling back to this device's default printer if none is configured for it) — see
   * printerConfig.getEffectivePrinterConfig. An order with a single station (the common
   * case for a cafe that hasn't set up multiple stations) still prints as one ticket,
   * exactly as before. */
  async printKot(kot: PrintableKot): Promise<PrintResult> {
    const groups = new Map<string, PrintableKotItem[]>();
    for (const item of kot.items) {
      const key = item.stationName ?? '';
      const bucket = groups.get(key);
      if (bucket) bucket.push(item); else groups.set(key, [item]);
    }

    if (groups.size <= 1) {
      const stationName = kot.items[0]?.stationName;
      const config = getEffectivePrinterConfig(stationName);
      return printLines(buildKotLines(kot, columnsFor(config)), config);
    }

    const results: { station: string; result: PrintResult }[] = [];
    for (const [stationName, items] of groups) {
      const config = getEffectivePrinterConfig(stationName || undefined);
      const result = await printLines(buildKotLines({ ...kot, items }, columnsFor(config)), config);
      results.push({ station: stationName || 'Kitchen', result });
    }

    return {
      ok: results.every((r) => r.result.ok),
      message: results.map((r) => `${r.station}: ${r.result.ok ? 'sent' : r.result.message}`).join('  ·  '),
    };
  },
  /** Customer-facing token slip — see POSCheckoutScreen's autoPrintTokenSlip. Always this
   * device's default printer (no per-station routing like printKot — a token number is
   * for the customer, not any one kitchen station). */
  printTokenSlip(slip: PrintableTokenSlip, configOverride?: PrinterConfig): Promise<PrintResult> {
    const config = configOverride ?? getPrinterConfig();
    return printLines(buildTokenSlipLines(slip, columnsFor(config)), config);
  },
};

function extractErrorMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'response' in err) {
    const resp = (err as { response?: { data?: { title?: string; detail?: string } } }).response;
    const msg = resp?.data?.title || resp?.data?.detail;
    if (msg) return msg;
  }
  if (err instanceof Error) return err.message;
  return 'Could not print — check the printer connection.';
}
