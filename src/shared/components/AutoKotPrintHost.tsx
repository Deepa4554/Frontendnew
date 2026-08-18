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
export const AutoKotPrintHost = () => {
  const dispatch = useDispatch();
  // activeOnly is essential here, not optional — kdsReady alone matches every order that has
  // EVER had anything fired, with no time bound (see KDSScreen, the other caller pairing them).
  const { data } = useOrders({ activeOnly: true, kdsReady: true });
  const orders = data?.items ?? [];
  // Baseline on first render, same reasoning as PendingOrdersHost.seenIds: every KOT that
  // already existed when this device opened the app was either already printed by whoever
  // fired it, or is stale history — only batches that appear AFTER mount are genuinely new.
  const baselined = useRef(false);

  useEffect(() => {
    if (!baselined.current) {
      orders.forEach((o) => o.fireBatches.forEach((b) => markKotPrinted(b.kotNumber)));
      baselined.current = true;
      return;
    }
    orders.forEach((order) => {
      order.fireBatches.forEach((batch) => {
        if (isKotPrinted(batch.kotNumber)) return;
        // Claim it before the print resolves — printKot is async, and the next poll tick
        // must not see this batch as still unclaimed and start a second print.
        markKotPrinted(batch.kotNumber);
        void printBatch(order, batch);
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders]);

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
