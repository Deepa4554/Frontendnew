/// <reference lib="dom" />
/**
 * Talks to PrintAgent (see PrabandhOS/PrintAgent) — a small program that runs on the till PC and
 * writes bytes straight to a Windows print queue in RAW mode. This is what lets a USB thermal
 * printer be reached WITHOUT Chrome's print dialog and WITHOUT the blur that dialog's HTML
 * rendering produces at 203 DPI (see PrintAgent/RawPrinter.cs's doc comment) — the same ESC/POS
 * bytes the WiFi and Bluetooth transports already send (buildEscPosFromLines, escpos.ts), just
 * handed to a local process instead of a TCP socket or a BLE characteristic.
 *
 * Optional by design: the agent is a separate download the cafe has to install and run, so every
 * call here is expected to sometimes fail simply because it isn't running — PrinterService treats
 * that as "fall back to the HTML dialog", not as an error to surface. A cafe that never installs
 * it keeps printing exactly as it did before this file existed.
 */
import { buildEscPosFromLines, escPosToBase64 } from './escpos';
import { ReceiptLine } from './receiptFormat';

const AGENT_BASE = 'http://127.0.0.1:9247';
// Short: a probe against a port nothing is listening on fails almost instantly, but a
// stalled/half-open connection shouldn't make the cashier wait long before the HTML dialog
// fallback kicks in.
const PROBE_TIMEOUT_MS = 1200;
const PRINT_TIMEOUT_MS = 8000;

const NO_FETCH_MESSAGE = 'This transport needs a browser.';

async function fetchWithTimeout(path: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(`${AGENT_BASE}${path}`, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export const UsbAgentPrinter = {
  isSupported: () => typeof fetch !== 'undefined',

  /** Whether PrintAgent is currently reachable on this machine — PrinterSettingsScreen uses
   * this to show setup status, PrinterService does NOT call it on the print path itself (a
   * failed printLines already means "not available", one round trip instead of two). */
  async isAvailable(): Promise<boolean> {
    if (!this.isSupported()) return false;
    try {
      const res = await fetchWithTimeout('/health', { method: 'GET' }, PROBE_TIMEOUT_MS);
      return res.ok;
    } catch {
      return false;
    }
  },

  /** The Windows printer names PrintAgent's host currently has installed — lets Printer
   * Settings offer a dropdown instead of the cashier retyping a name out of Devices and
   * Printers (a typo there is a silent "printer not found" at print time, not a save-time
   * error). Throws if the agent isn't reachable; callers show that as "couldn't detect". */
  async listPrinters(): Promise<string[]> {
    if (!this.isSupported()) throw new Error(NO_FETCH_MESSAGE);
    const res = await fetchWithTimeout('/printers', { method: 'GET' }, PROBE_TIMEOUT_MS);
    if (!res.ok) throw new Error(`PrintAgent returned ${res.status}.`);
    const body = (await res.json()) as { printers?: string[] };
    return body.printers ?? [];
  },

  /** Builds the same ESC/POS bytes the WiFi transport sends and hands them to PrintAgent for
   * `printerName` (a Windows printer name, e.g. "POS-58" — see Devices and Printers). Throws
   * on any failure (agent not running, printer name doesn't match, spooler rejected the job) —
   * PrinterService catches that and falls back to the HTML dialog rather than surfacing it. */
  async printLines(lines: ReceiptLine[], columns: number, printerName: string): Promise<void> {
    if (!this.isSupported()) throw new Error(NO_FETCH_MESSAGE);
    const bytes = buildEscPosFromLines(lines, columns);
    const dataBase64 = escPosToBase64(bytes);

    const res = await fetchWithTimeout(
      '/print',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ printerName, dataBase64 }),
      },
      PRINT_TIMEOUT_MS,
    );

    const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!res.ok || !body.ok) {
      throw new Error(body.error || `PrintAgent returned ${res.status}.`);
    }
  },
};
