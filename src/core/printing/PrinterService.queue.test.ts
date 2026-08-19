import { PrinterService } from './PrinterService';
import { printApi } from '../api/printApi';
import { PrintableKot } from './receiptFormat';

jest.mock('./printerConfig', () => {
  const wifi = { type: 'wifi', wifiIp: '10.0.0.7', wifiPort: 9100, columns: 32 };
  return { getPrinterConfig: () => wifi, getEffectivePrinterConfig: () => wifi };
});
jest.mock('../api/printApi', () => ({ printApi: { printWifi: jest.fn() } }));
// Both are only reached by the transports these tests don't exercise, but PrinterService
// imports them eagerly and the BLE one pulls in a native module that cannot load under jest.
jest.mock('./BluetoothPrinter', () => ({ BluetoothPrinter: { connect: jest.fn(), printLines: jest.fn() } }));
jest.mock('./BrowserPrinter', () => ({ BrowserPrinter: { printLines: jest.fn() } }));

const mockPrintWifi = printApi.printWifi as jest.MockedFunction<typeof printApi.printWifi>;

const kot = (kotNumber: string): PrintableKot => ({
  title: 'Table T1',
  kotNumber,
  time: '08:22 PM',
  items: [{ name: 'Cheese Grill', qty: 1 }],
});

// The RN TypeScript config has no node types, and these tests run under jest on node.
declare const Buffer: { from(s: string, encoding: string): { toString(encoding: string): string } };

/** Lets whatever the queue has already scheduled actually run. */
const flush = () => new Promise<void>((resolve) => setImmediate(() => resolve()));

/** A printWifi that hangs until the returned trigger is called, so a job can be held open. */
const holdOpen = () => {
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  mockPrintWifi.mockImplementationOnce(() => held);
  return release;
};

beforeEach(() => {
  jest.clearAllMocks();
  mockPrintWifi.mockResolvedValue(undefined);
});

describe('PrinterService print queue', () => {
  it('does not start a second print while the first is still going', async () => {
    // A printer is one serial device. Two jobs writing at once interleave their bytes and the
    // paper comes out with lines from different tickets spliced into each other — which is
    // what a batch of simultaneous KOTs actually produced on real hardware.
    const releaseFirst = holdOpen();

    const first = PrinterService.printKot(kot('#K1'));
    const second = PrinterService.printKot(kot('#K2'));
    await flush();

    expect(mockPrintWifi).toHaveBeenCalledTimes(1);

    releaseFirst();
    await Promise.all([first, second]);

    expect(mockPrintWifi).toHaveBeenCalledTimes(2);
  });

  it('keeps the queue moving after a job fails', async () => {
    // Without this the first unreachable printer would strand every ticket queued behind it,
    // which is a worse failure than the one print that actually went wrong.
    mockPrintWifi.mockRejectedValueOnce(new Error('printer unreachable'));

    const failed = await PrinterService.printKot(kot('#K3'));
    expect(failed.ok).toBe(false);

    const next = await PrinterService.printKot(kot('#K4'));
    expect(next.ok).toBe(true);
    expect(mockPrintWifi).toHaveBeenCalledTimes(2);
  });

  it('prints queued tickets in the order they were asked for', async () => {
    const sent: string[] = [];
    mockPrintWifi.mockImplementation(async (_ip, _port, dataBase64) => {
      sent.push(Buffer.from(dataBase64, 'base64').toString('latin1'));
    });

    await Promise.all([
      PrinterService.printKot(kot('#K5')),
      PrinterService.printKot(kot('#K6')),
      PrinterService.printKot(kot('#K7')),
    ]);

    expect(sent).toHaveLength(3);
    expect(sent[0]).toContain('#K5');
    expect(sent[1]).toContain('#K6');
    expect(sent[2]).toContain('#K7');
  });
});
