import { useEffect, useRef } from 'react';
import { useDispatch } from 'react-redux';
import { useOrders } from '../../core/api/hooks/useOrders';
import { ApiOrder, FireBatch } from '../../core/api/ordersApi';
import { PrinterService } from '../../core/printing/PrinterService';
import { isKotPrinted, markKotPrinted } from '../../core/printing/printedKots';
import { showToast } from '../../core/store/uiSlice';

/**
 * Safety-net auto-print for kitchen tickets nothing else prints.
 *
 * Every staff-initiated fire (POS, Table, Takeaway/Delivery, Token Dashboard screens) already
 * prints its own KOT right after firing, and PendingOrdersHost prints a guest's very first
 * round the moment staff taps Confirm. What none of those cover: a guest adding MORE items via
 * "Add more items" once the order is already past its first round — GuestSessionController.
 * PlaceOrder fires that round straight to the kitchen with no staff confirmation at all (see
 * needsConfirmation there, gated on CurrentFireBatch == 0), so nothing staff-side ever runs to
 * trigger a print for it. The kitchen still got the order, just no paper for it.
 *
 * Mounted once at the AppNavigator level (same as PendingOrdersHost), this polls active
 * kitchen-relevant orders and prints any fired batch that isn't already marked printed (see
 * printedKots.ts) — every explicit print path above marks its own batch there, so this only
 * ever ends up printing the ones nothing else claimed.
 */

/** Sanity ceiling on one poll tick's worth of auto-prints — see where it's applied below. */
const MAX_BATCHES_PER_TICK = 5;

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
    if (!baselined.current) {
      orders.forEach((o) => o.fireBatches.forEach((b) => markKotPrinted(b.kotNumber)));
      baselined.current = true;
      return;
    }

    const unprinted: { order: ApiOrder; batch: FireBatch }[] = [];
    orders.forEach((order) => {
      // The scope this host exists for is narrow: a guest firing a later round from their own
      // phone, which nothing staff-side ever runs for. Enforce that on the ORDER itself rather
      // than leaning on printedKots to be correctly populated — createdByName is null for
      // exactly the guest self-orders (OrderBuildingService only fills it for an authenticated
      // staff request), so a staff-rung POS/Table/Token ticket can never be printed from here
      // even when the marks Set is empty, which is precisely when this last went wrong.
      if (order.createdByName !== null) return;
      order.fireBatches.forEach((batch) => {
        if (isKotPrinted(batch.kotNumber)) return;
        // Claim it before the print resolves — printKot is async, and the next poll tick
        // must not see this batch as still unclaimed and start a second print.
        markKotPrinted(batch.kotNumber);
        unprinted.push({ order, batch });
      });
    });
    if (unprinted.length === 0) return;

    // This host only ever legitimately covers guests firing a later round themselves (see the
    // header comment) — a handful of those inside one 10s poll tick is a busy rush, a dozen is
    // a bug feeding it stale history. Refuse to print the pile rather than empty the roll, and
    // say so, since the kitchen still has every one of these tickets on the KDS board.
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
