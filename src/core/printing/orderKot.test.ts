import { buildOrderKot, printOrderKot, printAllOrderKots } from './orderKot';
import { PrinterService } from './PrinterService';
import type { ApiOrder } from '../api/ordersApi';

jest.mock('./PrinterService', () => ({
  PrinterService: { printKot: jest.fn() },
}));
jest.mock('./printedKots', () => ({ markKotPrinted: jest.fn(), isKotPrinted: () => false }));

const mockPrintKot = PrinterService.printKot as jest.MockedFunction<typeof PrinterService.printKot>;

const item = (id: number, name: string, fireBatch: number, voided = false) =>
  ({ id, name, qty: 1, fireBatch, voided, variantName: null, modifier: undefined, stationName: '', selectedModifiers: [] } as any);

/** Two rounds on one table — the exact shape the reprint bug was reported against. */
const twoRoundOrder = (overrides: Partial<ApiOrder> = {}): ApiOrder =>
  ({
    id: 1,
    title: 'Dine In',
    tableCode: 'T4',
    tokenNumber: null,
    guestName: 'Rahul',
    createdAt: '2026-09-04T10:00:00Z',
    currentFireBatch: 2,
    fireBatches: [
      { batchNumber: 1, status: 'SERVED', firedAt: '2026-09-04T10:00:00Z', kotNumber: 'KOT-101' },
      { batchNumber: 2, status: 'NEW', firedAt: '2026-09-04T10:30:00Z', kotNumber: 'KOT-102' },
    ],
    items: [item(1, 'Paneer Tikka', 1), item(2, 'Butter Naan', 1), item(3, 'Gulab Jamun', 2)],
    ...overrides,
  } as any);

beforeEach(() => {
  jest.clearAllMocks();
  mockPrintKot.mockResolvedValue({ ok: true, message: 'Sent to printer.' });
});

describe('buildOrderKot', () => {
  it('carries only the requested round, not the newest one', () => {
    // The bug this whole module exists to close: every screen's manual re-print filtered on
    // order.currentFireBatch, so asking for KOT 1 on a table that had ordered twice silently
    // produced KOT 2's items instead — the first round was unreachable from the entire app.
    const kot = buildOrderKot(twoRoundOrder(), 1);
    expect(kot?.kotNumber).toBe('KOT-101');
    expect(kot?.items.map((i) => i.name)).toEqual(['Paneer Tikka', 'Butter Naan']);
  });

  it('returns null for a round whose every line was voided', () => {
    // Removing a fired item voids it rather than deleting it, so the round still exists on
    // the order — printing it would hand the kitchen a ticket for food nobody is to make.
    const order = twoRoundOrder({ items: [item(1, 'Paneer Tikka', 1, true), item(3, 'Gulab Jamun', 2)] } as any);
    expect(buildOrderKot(order, 1)).toBeNull();
  });

  it('titles a table order by its table and adds the guest name', () => {
    const kot = buildOrderKot(twoRoundOrder(), 2);
    expect(kot?.title).toBe('Table T4');
    expect(kot?.guestName).toBe('Rahul');
  });

  it('leaves guestName off a takeaway, whose title already carries the name', () => {
    // order.title reads "Takeaway – Rahul" for these, so a guest line would print it twice.
    const kot = buildOrderKot(
      twoRoundOrder({ tableCode: null, title: 'Takeaway – Rahul' } as any),
      2,
    );
    expect(kot?.title).toBe('Takeaway – Rahul');
    expect(kot?.guestName).toBeUndefined();
  });
});

describe('printOrderKot', () => {
  it('prints exactly the one round it was asked for', async () => {
    // The auto-print-on-fire path stays single-round: firing a second round must not re-spool
    // the first one to the pass, which the kitchen already has paper for.
    await printOrderKot(twoRoundOrder(), 2);
    expect(mockPrintKot).toHaveBeenCalledTimes(1);
    expect(mockPrintKot.mock.calls[0][0].kotNumber).toBe('KOT-102');
  });
});

describe('printAllOrderKots', () => {
  it('re-prints every round, oldest first', async () => {
    const result = await printAllOrderKots(twoRoundOrder());
    expect(mockPrintKot.mock.calls.map((c) => c[0].kotNumber)).toEqual(['KOT-101', 'KOT-102']);
    expect(result).toEqual({ ok: true, message: '2 KOTs sent to kitchen printer.' });
  });

  it('orders by batch number even when fireBatches arrives out of order', async () => {
    // Rounds have to reach the pass in the order they were fired; the server's ordering is
    // not something this should be relying on.
    const order = twoRoundOrder();
    await printAllOrderKots({ ...order, fireBatches: [...order.fireBatches].reverse() } as ApiOrder);
    expect(mockPrintKot.mock.calls.map((c) => c[0].kotNumber)).toEqual(['KOT-101', 'KOT-102']);
  });

  it('skips rounds that were fully voided', async () => {
    const order = twoRoundOrder({ items: [item(1, 'Paneer Tikka', 1, true), item(3, 'Gulab Jamun', 2)] } as any);
    await printAllOrderKots(order);
    expect(mockPrintKot.mock.calls.map((c) => c[0].kotNumber)).toEqual(['KOT-102']);
  });

  it('returns null when the order has never fired anything', async () => {
    // Distinct from a failed print — the caller toasts "Nothing fired to the kitchen yet"
    // rather than a transport error, so a tap on an untouched order explains itself.
    const order = twoRoundOrder({ fireBatches: [], items: [item(1, 'Paneer Tikka', 0)], currentFireBatch: 0 } as any);
    expect(await printAllOrderKots(order)).toBeNull();
    expect(mockPrintKot).not.toHaveBeenCalled();
  });

  it('reports a partial failure rather than claiming success', async () => {
    // A printer that dies partway leaves the kitchen holding some of the rounds. Reporting ok
    // here would tell the cashier the paper trail is restored when half of it is missing.
    mockPrintKot
      .mockResolvedValueOnce({ ok: true, message: 'Sent to printer.' })
      .mockResolvedValueOnce({ ok: false, message: 'Printer is out of paper.' });
    const result = await printAllOrderKots(twoRoundOrder());
    expect(result).toEqual({
      ok: false,
      message: "Couldn't print 1 of 2 KOTs — Printer is out of paper.",
    });
  });
});
