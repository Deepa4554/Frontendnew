import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ordersApi, ApiOrder, CreateOrderRequest, OrderStatus, PaymentSplit } from '../ordersApi';
import { queryKeys } from './queryKeys';

export const useOrders = (params?: { activeOnly?: boolean; branchId?: number | null; page?: number; pageSize?: number; from?: string; to?: string; kdsReady?: boolean; orderType?: string }) =>
  useQuery({
    queryKey: queryKeys.orders(params),
    queryFn: () => ordersApi.list(params),
    // 30s was chosen on the assumption that OrdersHub's "ordersChanged" push (see
    // useOrdersRealtime) is the real near-live path and this is only a rarely-used safety
    // net. In production the socket is NOT reliably coming up, which makes this interval the
    // actual update mechanism — and a kitchen waiting half a minute to see a ticket is a
    // service problem. Back to roughly the pre-realtime cadence until the socket is proven
    // healthy; at ~6 requests/min this is still well inside the 200/min per-IP rate limit.
    refetchInterval: 10000,
    // React Query pauses refetchInterval whenever the tab/window loses focus unless this
    // is on — which silently disabled the safety net on exactly the screen that needs it
    // most: a KDS spends its whole life as an unfocused second window/monitor while staff
    // take orders elsewhere, so the board only caught up when someone touched it.
    refetchIntervalInBackground: true,
    staleTime: 0, // Data is immediately stale so any invalidation forces fresh fetch
  });

// Staff-Confirm Mode: a floor-staff popup should appear within a few seconds of a guest
// submitting their first order — that near-live feel now comes from OrdersHub's push (see
// useOrdersRealtime), this interval is just the safety net. Deliberately its own query (not
// reusing useOrders' activeOnly list) so this background poll, which every authenticated
// screen mounts (see usePendingConfirmationAlerts), stays a small, cheap request instead of
// dragging the whole active-orders payload along with it.
export const usePendingConfirmationOrders = () =>
  useQuery({
    queryKey: queryKeys.orders({ pendingConfirmation: true }),
    queryFn: () => ordersApi.list({ pendingConfirmation: true, pageSize: 50 }),
    refetchInterval: 30000,
    // A guest's order must still raise the staff-confirm popup when the POS window is
    // sitting in the background — same reason as useOrders above.
    refetchIntervalInBackground: true,
    staleTime: 0,
  });

export const useConfirmGuestOrder = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => ordersApi.confirmGuestOrder(id),
    // onSettled, not onSuccess: a FAILED confirm usually means the server-side state
    // moved under us (order cancelled/expired elsewhere) — refetching is exactly how the
    // stale card leaves the confirmation popup instead of sitting there looking frozen.
    onSettled: () => invalidateOrderGraph(qc),
  });
};

// Same safety-net interval as useOrders above — an open order-detail modal (Tables/Token
// Dashboard) must reflect a mutation's effect on its own rollup status (e.g. cancelling a
// KOT flipping the order to SERVED) even on the rare tick where the realtime push (see
// useOrdersRealtime) is missed, not just on the next explicit invalidate.
export const useOrder = (id: number | null) =>
  useQuery({
    queryKey: queryKeys.order(id ?? -1),
    queryFn: () => ordersApi.get(id as number),
    enabled: id !== null,
    refetchInterval: 30000,
    staleTime: 0,
  });

// Refetch on the same cadence as the daypart width (30 min) — this doesn't need
// KDS's 5s near-live polling, the underlying pattern only shifts hour to hour.
export const useRushForecast = () =>
  useQuery({ queryKey: queryKeys.rushForecast, queryFn: ordersApi.rushForecast, refetchInterval: 30 * 60 * 1000 });

// A fired order fans out to tables (occupancy), customers (visit/points/
// favorites), and inventory (stock consumption) — all invalidated together so
// every screen reading any of them re-fetches automatically.
const invalidateOrderGraph = (qc: ReturnType<typeof useQueryClient>) => {
  qc.invalidateQueries({ queryKey: ['orders'] });
  qc.invalidateQueries({ queryKey: queryKeys.tables });
  qc.invalidateQueries({ queryKey: ['customers'] });
  qc.invalidateQueries({ queryKey: ['inventory'] });
};

export const useCreateOrder = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: CreateOrderRequest) => ordersApi.create(req),
    onSuccess: () => invalidateOrderGraph(qc),
  });
};

export const useAdvanceOrder = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, batchNumber }: { id: number; batchNumber: number }) => ordersApi.advance(id, batchNumber),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['orders'] }),
  });
};

// Cancels one whole KOT/fire-batch — same reason-required-once-in-prep rule as
// useRemoveOrderItem, just scoped to every line in that round (see ordersApi.cancelBatch).
export const useCancelBatch = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, batchNumber, reason }: { id: number; batchNumber: number; reason?: string }) =>
      ordersApi.cancelBatch(id, batchNumber, reason),
    onSuccess: () => invalidateOrderGraph(qc),
  });
};

export const useAdvanceUnits = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, itemId, fromStage, qty }: { id: number; itemId: number; fromStage?: OrderStatus; qty?: number }) =>
      ordersApi.advanceUnits(id, itemId, { fromStage, qty }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['orders'] }),
  });
};

// QSR token flow: single-tap serve, no stage-by-stage stepping (see ordersApi.serveItem).
export const useServeItem = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, itemId }: { id: number; itemId: number }) => ordersApi.serveItem(id, itemId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['orders'] }),
  });
};

// QSR token flow: "Mark All as Served" in one tap (see ordersApi.serveAll).
export const useServeAll = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: number }) => ordersApi.serveAll(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['orders'] }),
  });
};

export const useBulkAdvance = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: { menuItemId: number; fromStage: OrderStatus; qty?: number; allocations?: { orderId: number; itemId: number; qty: number }[] }) =>
      ordersApi.bulkAdvance(req),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['orders'] }),
  });
};

export const useSetOrderStatus = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: number; status: OrderStatus }) => ordersApi.setStatus(id, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['orders'] }),
  });
};

export const usePayOrder = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, paymentMethod, splits, allowPartial, keepOpen }: { id: number; paymentMethod?: string; splits?: PaymentSplit[]; allowPartial?: boolean; keepOpen?: boolean }) =>
      ordersApi.pay(id, paymentMethod, splits, allowPartial, keepOpen),
    // onSettled, not onSuccess: same reasoning as useConfirmGuestOrder — a failed pay is
    // usually "Order is already paid" (OrdersController's row-locked guard) because someone
    // else settled it on another device, so the failure is precisely when this screen's copy
    // is known to be stale and most needs refetching. Without this the open order modal sits
    // on the pre-payment state until useOrder's 30s tick happens to come round.
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: queryKeys.tables });
    },
  });
};

/** Saves a guest phone/name onto an existing order — see ordersApi.updateGuest. Also
 * invalidates customers, since setting a phone re-links (and can re-credit) a CRM record. */
export const useUpdateOrderGuest = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, guestName, guestPhone }: { id: number; guestName?: string; guestPhone?: string }) =>
      ordersApi.updateGuest(id, { guestName, guestPhone }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['customers'] });
    },
  });
};

/** Finalizes a keepOpen (Pay First) order once no more items are going to be added — see
 * ordersApi.close. Same invalidation graph as usePayOrder since it's the same paid transition. */
export const useCloseOrder = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => ordersApi.close(id),
    // onSettled for the same reason as usePayOrder above — it's the same paid transition,
    // guarded by the same "already paid" conflict.
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: queryKeys.tables });
    },
  });
};

// Fire (dispatch unfired items to kitchen), add/remove item, and billing-time
// discount/coupon/gift card all change what Tables/KDS/Billing show — invalidate
// the same graph usePayOrder does.
export const useFireOrder = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => ordersApi.fire(id),
    onSuccess: () => invalidateOrderGraph(qc),
  });
};

export const useAddOrderItem = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, menuItemId, qty, modifier, variantId, modifierOptionIds }: { id: number; menuItemId: number; qty: number; modifier?: string; variantId?: number; modifierOptionIds?: number[] }) =>
      ordersApi.addItem(id, { menuItemId, qty, modifier, variantId, modifierOptionIds }),
    onSuccess: () => invalidateOrderGraph(qc),
  });
};

export const useRemoveOrderItem = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, itemId, reason }: { id: number; itemId: number; reason?: string }) => ordersApi.removeItem(id, itemId, reason),
    onSuccess: () => invalidateOrderGraph(qc),
  });
};

export const useCancelOrder = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: number; reason?: string }) => ordersApi.cancel(id, reason),
    // onSettled for the same reason as useConfirmGuestOrder: a failed cancel ("already
    // cancelled") means our list is stale — refetch so the card clears from the popup.
    onSettled: () => invalidateOrderGraph(qc),
  });
};

export const useShiftTable = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, newTableCode }: { id: number; newTableCode: string }) => ordersApi.shiftTable(id, newTableCode),
    onSuccess: () => invalidateOrderGraph(qc),
  });
};

export const useApplyBillDiscount = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, pct, amount }: { id: number; pct?: number; amount?: number }) => ordersApi.billDiscount(id, { pct, amount }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: queryKeys.tables });
    },
  });
};

export const useBillCoupon = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, code }: { id: number; code: string }) => ordersApi.billCoupon(id, code),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: queryKeys.tables });
    },
  });
};

export const useBillGiftCard = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, code }: { id: number; code: string }) => ordersApi.billGiftCard(id, code),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: queryKeys.tables });
    },
  });
};

export const useBillLoyalty = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, points }: { id: number; points: number }) => ordersApi.billLoyalty(id, points),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: queryKeys.tables });
      qc.invalidateQueries({ queryKey: ['customers'] });
    },
  });
};

type BillChargesRequest = { id: number; serviceChargePct?: number; serviceChargeAmount?: number; packingChargeAmount?: number; deliveryChargeAmount?: number; tipAmount?: number; roundOffAmount?: number };

export const useBillCharges = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...req }: BillChargesRequest) => ordersApi.billCharges(id, req),
    // Optimistic patch so OrderBillActions' Switch rows and pencil-edit editor move the
    // instant they're used, instead of sitting still until this round-trips and the order
    // refetches (a Switch/edited amount that doesn't visibly move reads as broken). Total
    // absorbs the same delta as whichever charge changed — Tax doesn't depend on these
    // charges (see OrderBuildingService.RecomputeTotals), so it's untouched here. Reverted
    // in onError if the request actually fails; onSuccess still invalidates for the exact
    // server-computed values (rounding can differ by a paisa from this estimate).
    onMutate: async ({ id, ...req }) => {
      await qc.cancelQueries({ queryKey: queryKeys.order(id) });
      const previousOrder = qc.getQueryData<ApiOrder>(queryKeys.order(id));
      if (previousOrder) {
        const next: ApiOrder = { ...previousOrder };
        let delta = 0;
        if (req.serviceChargePct !== undefined) {
          const newAmount = Math.round(previousOrder.subtotal * req.serviceChargePct) / 100;
          delta += newAmount - previousOrder.serviceChargeAmount;
          next.serviceChargeAmount = newAmount;
        } else if (req.serviceChargeAmount !== undefined) {
          delta += req.serviceChargeAmount - previousOrder.serviceChargeAmount;
          next.serviceChargeAmount = req.serviceChargeAmount;
        }
        if (req.packingChargeAmount !== undefined) {
          delta += req.packingChargeAmount - previousOrder.packingChargeAmount;
          next.packingChargeAmount = req.packingChargeAmount;
        }
        if (req.deliveryChargeAmount !== undefined) {
          delta += req.deliveryChargeAmount - previousOrder.deliveryChargeAmount;
          next.deliveryChargeAmount = req.deliveryChargeAmount;
        }
        if (req.tipAmount !== undefined) {
          delta += req.tipAmount - previousOrder.tipAmount;
          next.tipAmount = req.tipAmount;
        }
        if (req.roundOffAmount !== undefined) {
          delta += req.roundOffAmount - previousOrder.roundOffAmount;
          next.roundOffAmount = req.roundOffAmount;
        }
        next.total = previousOrder.total + delta;
        next.balanceDue = previousOrder.balanceDue + delta;
        qc.setQueryData(queryKeys.order(id), next);
      }
      return { previousOrder, id };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previousOrder) qc.setQueryData(queryKeys.order(ctx.id), ctx.previousOrder);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: queryKeys.tables });
    },
  });
};

export const useRefundOrder = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, amount, reason }: { id: number; amount?: number; reason?: string }) => ordersApi.refund(id, amount, reason),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['orders'] }),
  });
};
