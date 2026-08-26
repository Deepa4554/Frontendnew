import React from 'react';
import { renderWithProviders, act, waitFor } from '../../test-utils';
import { useOrders } from '../../core/api/hooks/useOrders';
import { PrinterService } from '../../core/printing/PrinterService';
import { hasAnyPrinterConfigured, isAutoPrintHost } from '../../core/printing/printerConfig';
import { AutoKotPrintHost } from './AutoKotPrintHost';

jest.mock('../../core/api/hooks/useOrders', () => ({ useOrders: jest.fn() }));
jest.mock('../../core/printing/PrinterService', () => ({
  PrinterService: { printKot: jest.fn() },
}));
jest.mock('../../core/printing/printerConfig', () => ({
  hasAnyPrinterConfigured: jest.fn(),
  isAutoPrintHost: jest.fn(),
}));

const mockUseOrders = useOrders as jest.MockedFunction<typeof useOrders>;
const mockPrintKot = PrinterService.printKot as jest.MockedFunction<typeof PrinterService.printKot>;
const mockHasAnyPrinterConfigured = hasAnyPrinterConfigured as jest.MockedFunction<typeof hasAnyPrinterConfigured>;
const mockIsAutoPrintHost = isAutoPrintHost as jest.MockedFunction<typeof isAutoPrintHost>;

/**
 * printedKots is a module-level Set with no reset (deliberately — see printedKots.ts), and
 * jest keeps one module registry for the whole file. So every test uses its own KOT numbers
 * rather than trying to clear it; a number one test marked can never affect another.
 */
let kotSeq = 0;
const nextKot = () => `#K${++kotSeq}`;

/** Minimal order shaped only as far as AutoKotPrintHost actually reads it. `firedAtAgoMs`
 * defaults to "just now", which is what every case except the staleness ones wants. */
const makeOrder = (opts: { createdByName: string | null; kotNumbers: string[]; firedAtAgoMs?: number }) => ({
  id: kotSeq,
  title: 'Table #1',
  tableCode: 'T1',
  guestName: 'Guest',
  createdByName: opts.createdByName,
  items: opts.kotNumbers.map((_, i) => ({
    name: 'Cheese Grill',
    qty: 1,
    fireBatch: i + 1,
    voided: false,
  })),
  fireBatches: opts.kotNumbers.map((kotNumber, i) => ({
    kotNumber,
    batchNumber: i + 1,
    firedAt: new Date(Date.now() - (opts.firedAtAgoMs ?? 0)).toISOString(),
  })),
});

const MINUTE = 60 * 1000;

/** One React Query page of orders. A fresh object each time, since the effect keys off `data`. */
const loaded = (...orders: ReturnType<typeof makeOrder>[]) =>
  ({ data: { items: orders, total: orders.length, page: 1, pageSize: 50 } } as any);

const loading = { data: undefined } as any;

/** Lets the effect's queued promises settle so a "did not print" assertion means something. */
const flush = async () => {
  await act(async () => {
    await Promise.resolve();
  });
};

beforeEach(() => {
  jest.clearAllMocks();
  mockPrintKot.mockResolvedValue({ ok: true, message: 'Sent to printer.' });
  mockHasAnyPrinterConfigured.mockReturnValue(true);
  mockIsAutoPrintHost.mockReturnValue(true);
});

describe('AutoKotPrintHost', () => {
  it('does not print the backlog when the order list arrives after the first empty render', async () => {
    // The regression this exists for. `useOrders` returns undefined data while the request is
    // in flight, so the component's first render sees the `?? []` placeholder. Baselining on
    // that marks nothing as printed, and every already-fired batch in the real list that lands
    // a moment later then looks brand new — which is how connecting a printer once emptied a
    // whole roll printing months of old tickets at a live cafe.
    const backlog = makeOrder({ createdByName: null, kotNumbers: [nextKot(), nextKot(), nextKot()] });

    mockUseOrders.mockReturnValue(loading);
    const { rerender } = await renderWithProviders(<AutoKotPrintHost />);

    mockUseOrders.mockReturnValue(loaded(backlog));
    await rerender(<AutoKotPrintHost />);
    await flush();

    expect(mockPrintKot).not.toHaveBeenCalled();
  });

  it('prints a guest round that is fired after the baseline', async () => {
    // The case the host is actually for: a guest adds more items from their own phone once the
    // order is past its first round, so no staff action ever runs to print it.
    const firstRound = nextKot();
    const laterRound = nextKot();

    mockUseOrders.mockReturnValue(loaded(makeOrder({ createdByName: null, kotNumbers: [firstRound] })));
    const { rerender } = await renderWithProviders(<AutoKotPrintHost />);
    await flush();
    expect(mockPrintKot).not.toHaveBeenCalled(); // baseline round, someone else's to print

    mockUseOrders.mockReturnValue(
      loaded(makeOrder({ createdByName: null, kotNumbers: [firstRound, laterRound] })),
    );
    await rerender(<AutoKotPrintHost />);

    await waitFor(() => expect(mockPrintKot).toHaveBeenCalledTimes(1));
    expect(mockPrintKot).toHaveBeenCalledWith(expect.objectContaining({ kotNumber: laterRound }));
  });

  it('prints a staff-rung order on a device opted in as an auto-print host', async () => {
    // Printer setup is per-device — the waiter's phone that fired this and the till with the
    // actual printer are frequently not the same device. A staff-rung order (createdByName
    // set) now qualifies too, but only once this device has turned on "auto-print host" in
    // Printer Settings (isAutoPrintHost) — see the next test for why that's opt-in.
    const kot = nextKot();
    mockUseOrders.mockReturnValue(loaded());
    const { rerender } = await renderWithProviders(<AutoKotPrintHost />);
    await flush();

    mockUseOrders.mockReturnValue(
      loaded(makeOrder({ createdByName: 'Deepali', kotNumbers: [kot] })),
    );
    await rerender(<AutoKotPrintHost />);

    await waitFor(() => expect(mockPrintKot).toHaveBeenCalledTimes(1));
    expect(mockPrintKot).toHaveBeenCalledWith(expect.objectContaining({ kotNumber: kot }));
  });

  it('leaves a staff-rung order alone on a device that is not an auto-print host', async () => {
    // The fix for the multi-device problem: if every device with a printer auto-printed every
    // staff order, a cafe with printers on two tills would double-print constantly. Opting a
    // device out (the default) means it only ever prints what it fires itself, plus a guest's
    // own later round — never someone else's staff-rung ticket.
    mockIsAutoPrintHost.mockReturnValue(false);
    mockUseOrders.mockReturnValue(loaded());
    const { rerender } = await renderWithProviders(<AutoKotPrintHost />);
    await flush();

    mockUseOrders.mockReturnValue(
      loaded(makeOrder({ createdByName: 'Deepali', kotNumbers: [nextKot()] })),
    );
    await rerender(<AutoKotPrintHost />);
    await flush();

    expect(mockPrintKot).not.toHaveBeenCalled();
  });

  it('stays silent on a device with no printer configured, instead of toasting for every order in the cafe', async () => {
    // Broadening scope to every order (not just a guest's own later round) means this now runs
    // on every device's screen, all day. Skip entirely rather than surface "No printer set up
    // yet" for orders this device was never going to print.
    mockHasAnyPrinterConfigured.mockReturnValue(false);
    mockUseOrders.mockReturnValue(loaded());
    const { rerender } = await renderWithProviders(<AutoKotPrintHost />);
    await flush();

    mockUseOrders.mockReturnValue(
      loaded(makeOrder({ createdByName: 'Deepali', kotNumbers: [nextKot()] })),
    );
    await rerender(<AutoKotPrintHost />);
    await flush();

    expect(mockPrintKot).not.toHaveBeenCalled();
  });

  it('does not print a round fired too long ago to still be worth cooking', async () => {
    // The guest has eaten and gone. Whatever went wrong — printer off, tab closed — the ticket
    // is now only paper: the kitchen either made this food long ago or never will.
    mockUseOrders.mockReturnValue(loaded());
    const { rerender } = await renderWithProviders(<AutoKotPrintHost />);
    await flush();

    mockUseOrders.mockReturnValue(
      loaded(makeOrder({ createdByName: null, kotNumbers: [nextKot()], firedAtAgoMs: 45 * MINUTE })),
    );
    await rerender(<AutoKotPrintHost />);
    await flush();

    expect(mockPrintKot).not.toHaveBeenCalled();
  });

  it('still prints a round that is only a few minutes late', async () => {
    // The other side of the same rule: a printer switched back on, or a laptop waking up,
    // must not cost the kitchen a ticket for food nobody has started yet.
    mockUseOrders.mockReturnValue(loaded());
    const { rerender } = await renderWithProviders(<AutoKotPrintHost />);
    await flush();

    const late = nextKot();
    mockUseOrders.mockReturnValue(
      loaded(makeOrder({ createdByName: null, kotNumbers: [late], firedAtAgoMs: 6 * MINUTE })),
    );
    await rerender(<AutoKotPrintHost />);

    await waitFor(() => expect(mockPrintKot).toHaveBeenCalledTimes(1));
    expect(mockPrintKot).toHaveBeenCalledWith(expect.objectContaining({ kotNumber: late }));
  });

  it('refuses to print a whole pile that shows up in one poll tick', async () => {
    // A handful of guest re-fires inside one 10s tick is a rush; a pile is a bug feeding it
    // stale history. The kitchen still has every one of these on the KDS board, so skipping
    // is the safe side to err on — better than emptying the roll again.
    mockUseOrders.mockReturnValue(loaded());
    const { rerender } = await renderWithProviders(<AutoKotPrintHost />);
    await flush();

    const pile = Array.from({ length: 6 }, () =>
      makeOrder({ createdByName: null, kotNumbers: [nextKot()] }),
    );
    mockUseOrders.mockReturnValue(loaded(...pile));
    await rerender(<AutoKotPrintHost />);
    await flush();

    expect(mockPrintKot).not.toHaveBeenCalled();
  });
});
