import { useEffect, useRef } from 'react';
import { useDispatch } from 'react-redux';
import { useOrders } from '../../core/api/hooks/useOrders';
import { ApiOrder, FireBatch } from '../../core/api/ordersApi';
import { PrinterService } from '../../core/printing/PrinterService';
import { isKotPrinted, markKotPrinted } from '../../core/printing/printedKots';
import { hasAnyPrinterConfigured, isAutoPrintHost } from '../../core/printing/printerConfig';
import { serverNow } from '../../core/network/serverClock';
import { showToast } from '../../core/store/uiSlice';

/**
 * Auto-prints kitchen tickets this device didn't fire itself.
 *
 * Two things it covers, gated separately because their blast radius is different:
 *
 * 1. A guest's own later round ("Add more items" past the first round) — nothing staff-side
 *    ever runs for that (see GuestSessionController.PlaceOrder's needsConfirmation, gated on
 *    CurrentFireBatch == 0), so SOME device has to catch it. Safe to run on every device with a
 *    printer, gated only on hasAnyPrinterConfigured(): it's rare enough that two printers both
 *    firing on the same guest round is not a real-world problem.
 *
 * 2. Every OTHER fired batch (POS/Table/Takeaway/Token) — these already print on the device
 *    that fired them, so this is purely about reaching a DIFFERENT device's printer (a waiter's
 *    phone took the order, the till's printer is what's actually plugged in). Gated additionally
 *    on isAutoPrintHost(): unlike case 1, every order in the cafe qualifies, so if more than one
 *    device had this on it'd double-print constantly. Off by default; a cafe turns it on for
 *    exactly the device(s) meant to be "the" printer (see PrinterSettingsScreen).
 *
 * Either way: polls active kitchen-relevant orders and prints any fired batch this device hasn't
 * already marked printed (see printedKots.ts) — every explicit print path marks its own batch
 * there, so a device that fired an order itself never reprints it here.
 *
 * Gated on hasAnyPrinterConfigured() before anything else: a device with nothing plugged in has
 * no business claiming a batch or popping a "no printer set up" toast for every order fired
 * anywhere in the cafe. Skipping (not just failing silently) also means a device configured
 * mid-shift baselines against whatever's active at that moment instead of dumping the day's
 * backlog — same reasoning as the baseline guard below.
 */

/** Sanity ceiling on one poll tick's worth of auto-prints — see where it's applied below. */
const MAX_BATCHES_PER_TICK = 5;

/**
 * How late a kitchen ticket may still be worth making. Change this one number to retune.
 *
 * A guest's round should reach the printer within seconds; if it hasn't, something broke —
 * printer off, tab closed, network down. The question this answers is what to do when that
 * clears: a ticket ten minutes late is still food nobody has cooked yet, an hour late is a
 * guest who has eaten and gone, and printing it just wastes paper and confuses the kitchen.
 *
 * Fifteen minutes is long enough to cover a printer being switched back on or a laptop waking
 * up, and short enough that nothing prints for a table that has already been cleared.
 */
const MAX_BATCH_AGE_MS = 15 * 60 * 1000;

export const AutoKotPrintHost = () => {
  const dispatch = useDispatch();
  // activeOnly is essential here, not optional — kdsReady alone matches every order that has
  // EVER had anything fired, with no time bound (see KDSScreen, the other caller pairing them).
  const { data } = useOrders({ activeOnly: true, kdsReady: true });
  const orders = data?.items ?? [];
  // Baseline on the first LOADED list, same reasoning as PendingOrdersHost.seenIds: every KOT
  // that already existed when this device opened the app was either already printed by whoever
  // fired it, or is stale history — only batches that appear AFTER mount are genuinely new.
  const baselined = useRef(false);

  useEffect(() => {
    // Nothing has come back from the server yet, so `orders` is the `?? []` placeholder above
    // — an unknown kitchen, NOT an empty one. Baselining against it marks nothing as printed,
    // and then the moment the real list lands every already-fired batch on it looks brand new.
    // That is exactly how connecting a printer once dumped a whole roll of old tickets at
    // once: the baseline had been consumed by the empty loading render seconds earlier.
    if (!data) return;
    if (!hasAnyPrinterConfigured()) return;
    if (!baselined.current) {
      orders.forEach((o) => o.fireBatches.forEach((b) => markKotPrinted(b.kotNumber)));
      baselined.current = true;
      return;
    }

    const autoPrintHost = isAutoPrintHost();
    const unprinted: { order: ApiOrder; batch: FireBatch }[] = [];
    orders.forEach((order) => {
      // Case 1 (guest's own later round) always qualifies; case 2 (everything else) only on a
      // device the cafe has opted in as an auto-print host — see the header comment.
      if (order.createdByName !== null && !autoPrintHost) return;
      order.fireBatches.forEach((batch) => {
        if (isKotPrinted(batch.kotNumber)) return;
        // Claim it before the print resolves — printKot is async, and the next poll tick
        // must not see this batch as still unclaimed and start a second print. Stale batches
        // are claimed too: they are decided, just decided against, and leaving them unmarked
        // would re-evaluate the same dead tickets on every tick forever.
        markKotPrinted(batch.kotNumber);
        // serverNow(), not Date.now(): firedAt is stamped by the server's UTC clock, so the
        // age is only meaningful measured against that same clock. A till running ten minutes
        // fast would otherwise discard perfectly fresh tickets — see serverClock.ts.
        if (serverNow() - new Date(batch.firedAt).getTime() > MAX_BATCH_AGE_MS) return;
        unprinted.push({ order, batch });
      });
    });
    if (unprinted.length === 0) return;

    // A handful of unclaimed batches inside one 10s poll tick is a busy rush; a dozen is a bug
    // feeding it stale history (e.g. a printer coming back online to a day's backlog). Refuse
    // to print the pile rather than empty the roll, and say so, since the kitchen still has
    // every one of these tickets on the KDS board.
    if (unprinted.length > MAX_BATCHES_PER_TICK) {
      dispatch(showToast({
        message: `Skipped auto-printing ${unprinted.length} kitchen tickets at once — check the KDS board.`,
        icon: 'printer-off-outline',
        tone: 'warning',
      }));
      return;
    }
    unprinted.forEach(({ order, batch }) => void printBatch(order, batch));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const printBatch = async (order: ApiOrder, batch: FireBatch) => {
    const batchItems = order.items.filter((i) => i.fireBatch === batch.batchNumber && !i.voided);
    if (batchItems.length === 0) return;
    const result = await PrinterService.printKot({
      title: order.tableCode ? `Table ${order.tableCode}` : order.title,
      kotNumber: batch.kotNumber,
      time: new Date(batch.firedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      guestName: order.tableCode ? order.guestName : undefined,
      items: batchItems.map((i) => ({
        name: i.name, qty: i.qty, variantName: i.variantName, modifier: i.modifier, stationName: i.stationName, vegNonVegType: i.vegNonVegType,
        selectedModifiers: i.selectedModifiers, subtitle: i.subtitle,
      })),
    });
    dispatch(showToast({ message: result.ok ? 'KOT sent to kitchen printer.' : result.message, icon: result.ok ? 'printer-check' : 'alert-circle-outline', tone: result.ok ? 'success' : 'warning' }));
  };

  return null;
};
