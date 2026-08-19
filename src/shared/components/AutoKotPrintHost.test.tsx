import React from 'react';
import { renderWithProviders, act, waitFor } from '../../test-utils';
import { useOrders } from '../../core/api/hooks/useOrders';
import { PrinterService } from '../../core/printing/PrinterService';
import { AutoKotPrintHost } from './AutoKotPrintHost';

jest.mock('../../core/api/hooks/useOrders', () => ({ useOrders: jest.fn() }));
jest.mock('../../core/printing/PrinterService', () => ({
  PrinterService: { printKot: jest.fn() },
}));

const mockUseOrders = useOrders as jest.MockedFunction<typeof useOrders>;
const mockPrintKot = PrinterService.printKot as jest.MockedFunction<typeof PrinterService.printKot>;

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

  it('never prints a staff-rung order, even with nothing marked as printed', async () => {
    // Scope is enforced on the order itself (createdByName is null only for guest self-orders)
    // rather than on printedKots being correctly populated — so a POS/Table/Token ticket staff
    // already printed at the till cannot come out of here a second time.
    mockUseOrders.mockReturnValue(loaded());
    const { rerender } = await renderWithProviders(<AutoKotPrintHost />);
    await flush();

    mockUseOrders.mockReturnValue(
      loaded(makeOrder({ createdByName: 'Deepali', kotNumbers: [nextKot(), nextKot()] })),
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
