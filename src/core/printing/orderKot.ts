import type { ApiOrder } from '../api/ordersApi';
import type { PrintableKot } from './receiptFormat';
import { PrinterService, type PrintResult } from './PrinterService';
import { markKotPrinted } from './printedKots';

/**
 * Builds and prints an order's kitchen tickets. Every screen that can print a KOT — POS,
 * Tables, Takeaway/Delivery, Token Orders, PendingOrdersHost — used to carry its own copy of
 * this mapping, five near-identical blocks differing only in how they spelled the ticket
 * title. That duplication is what let one bug land in four places at once: each screen's
 * manual "Print KOT" button reused the auto-print-on-fire path, which is hardcoded to
 * `order.currentFireBatch`. Correct when firing (the round that just fired IS the newest),
 * but it meant a re-print could only ever reproduce the LAST round — on a table with two
 * rounds, KOT 1 was unreachable from every button in the app.
 */

/**
 * Ticket title + guest line for an order, in one place so all five call sites agree.
 *
 * `order.title` already reads "Takeaway – <guest>" / "Delivery – <guest>" once neither a
 * token nor a table applies, so guestName is only added on top for Token/Table orders —
 * otherwise the same name prints twice on the same ticket.
 */
const kotHeadingFor = (order: ApiOrder): Pick<PrintableKot, 'title' | 'guestName'> =>
  order.tokenNumber != null
    ? { title: `Token #${order.tokenNumber}`, guestName: order.guestName }
    : order.tableCode
    ? { title: `Table ${order.tableCode}`, guestName: order.guestName }
    : { title: order.title, guestName: undefined };

/**
 * One fire round as a printable ticket, or null when that round has nothing left to print —
 * either it never fired, or every line in it has since been voided. Removing a fired item
 * VOIDS it rather than deleting it (soft delete so KOT/ledger history survives, see
 * OrdersController.RemoveItem), so an un-filtered round can still hold rows the kitchen was
 * told to stop making.
 */
export const buildOrderKot = (order: ApiOrder, batchNumber: number): PrintableKot | null => {
  const batchItems = order.items.filter((i) => i.fireBatch === batchNumber && !i.voided);
  if (batchItems.length === 0) return null;
  const batch = order.fireBatches.find((b) => b.batchNumber === batchNumber);
  return {
    ...kotHeadingFor(order),
    kotNumber: batch?.kotNumber || `#${batchNumber}`,
    // Device-local, matching what this printed before the five copies were merged. It is one
    // of the call sites that should eventually go through formatIstReceiptTime (see
    // core/utils/istDate.ts) so a tablet on the wrong timezone can't disagree with the bill;
    // now that it lives in exactly one place, that is a one-line change.
    time: new Date(batch?.firedAt ?? order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    items: batchItems.map((i) => ({
      name: i.name, qty: i.qty, variantName: i.variantName, modifier: i.modifier, stationName: i.stationName,
      vegNonVegType: i.vegNonVegType, selectedModifiers: i.selectedModifiers, subtitle: i.subtitle,
    })),
  };
};

/**
 * Prints a single fire round. Returns null when that round has nothing printable, so each
 * caller decides whether that is silent (auto-print on fire) or a toast (a manual tap that
 * would otherwise look like nothing happened).
 *
 * Used by the auto-print-on-fire path, where `order.currentFireBatch` is genuinely the right
 * batch — the round that just fired.
 */
export const printOrderKot = async (order: ApiOrder, batchNumber: number): Promise<PrintResult | null> => {
  const kot = buildOrderKot(order, batchNumber);
  if (!kot) return null;
  // Claim it before printing, not after — see printedKots.ts. AutoKotPrintHost's safety-net
  // poll can land while this request is still in flight, and it must already see this batch
  // as spoken for or the kitchen gets the same ticket twice.
  markKotPrinted(kot.kotNumber);
  return PrinterService.printKot(kot);
};

/**
 * Re-prints every round on the order, oldest first — what the popups' manual "Print KOT"
 * button does. A cashier reaching for it after the fact wants the kitchen's paper trail
 * restored (printer was off, out of paper, jammed), and the round that needs re-printing is
 * as often the first as the last.
 *
 * Sequential rather than Promise.all: PrinterService queues internally (see enqueuePrint), so
 * concurrent calls would come out in whatever order the queue drained them, and rounds must
 * reach the pass in the order they were fired. Returns null when the order has never fired
 * anything, and otherwise one combined result — ok only if every ticket made it, so a printer
 * that dies partway through still reports a failure rather than a silent partial print.
 */
export const printAllOrderKots = async (order: ApiOrder): Promise<PrintResult | null> => {
  const results: PrintResult[] = [];
  for (const batch of [...order.fireBatches].sort((a, b) => a.batchNumber - b.batchNumber)) {
    const result = await printOrderKot(order, batch.batchNumber);
    if (result) results.push(result);
  }
  if (results.length === 0) return null;
  const failed = results.filter((r) => !r.ok);
  if (failed.length === 0) {
    return {
      ok: true,
      message: results.length === 1 ? results[0].message : `${results.length} KOTs sent to kitchen printer.`,
    };
  }
  // Names the count both ways: after a partial failure the cashier's next move depends on how
  // much paper actually came out, and "couldn't print 1 of 3" answers that where a bare
  // transport error ("Printer IP isn't configured") does not.
  return {
    ok: false,
    message: `Couldn't print ${failed.length} of ${results.length} KOTs — ${failed[0].message}`,
  };
};
