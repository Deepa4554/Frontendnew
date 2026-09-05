import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  menuApi,
  MenuItem,
  CreateMenuItemRequest,
  UpdateMenuItemRequest,
  CreateVariantRequest,
  UpdateVariantRequest,
  SetChannelVisibilityRequest,
  CreateMenuScheduleRequest,
  LogPriceChangeRequest,
} from '../menuApi';
import { queryKeys } from './queryKeys';

export const useMenuItems = () => useQuery({ queryKey: queryKeys.menu, queryFn: menuApi.list });

export const useBestSellers = () => useQuery({ queryKey: queryKeys.bestSellers, queryFn: () => menuApi.bestSellers('month') });

/** Today's top 3 best-selling items so far, from midnight to now. Primary near-live
 * path is OrdersHub's "ordersChanged" push (see useOrdersRealtime) — this interval is
 * just the safety net for a dropped/blocked socket. */
export const useTodaysBestSeller = () =>
  useQuery({
    queryKey: queryKeys.bestSellersToday,
    queryFn: () => menuApi.bestSellers('today'),
    refetchInterval: 60 * 60 * 1000,
  });

export const useBulkCreateMenuItems = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (items: CreateMenuItemRequest[]) => menuApi.bulkCreate(items),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.menu });
      qc.invalidateQueries({ queryKey: queryKeys.bestSellers });
    },
  });
};

export const useCreateMenuItem = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: CreateMenuItemRequest) => menuApi.create(req),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.menu });
      qc.invalidateQueries({ queryKey: queryKeys.bestSellers });
    },
  });
};

export const useUpdateMenuItem = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, req }: { id: number; req: UpdateMenuItemRequest }) => menuApi.update(id, req),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.menu });
      qc.invalidateQueries({ queryKey: queryKeys.bestSellers });
    },
  });
};

export const useToggleMenuAvailability = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => menuApi.toggleAvailability(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.menu });
      qc.invalidateQueries({ queryKey: queryKeys.bestSellers });
    },
  });
};

/** Ticket of the most recent tap on each menu item id, so a burst of taps refetches once at
 *  the end instead of once per tap — and, more importantly, never mid-burst: a refetch that
 *  started before the last toggle reached the database would answer with a stale pin and undo
 *  the flip. Module-level rather than per-hook, because two mounted screens tapping the same
 *  item are still one burst. Each id's entry is dropped as soon as its burst settles. */
const latestPinTap = new Map<number, number>();
let pinTapCount = 0;

/** Pins/unpins an item to the front of the POS grid — see menuApi.togglePinned.
 *
 *  Optimistic, because the till has to answer the tap immediately. Previously the icon only
 *  moved once the PATCH had come back *and* a full menu refetch had landed behind it — a
 *  second or more on a real cafe's menu, since GET /menu-items eager-loads every item's
 *  variants, modifiers and options. Staff read that silence as a missed tap and tapped again,
 *  and because the endpoint is a blind toggle (Pinned = !Pinned) each extra tap flipped the
 *  item straight back — so the pin looked broken about as often as it looked slow.
 *
 *  Now the cached list flips on the tap and the server catches up behind it. The response body
 *  is ignored: TogglePinned returns a bare FindAsync entity whose Variants/Modifiers collections
 *  are unloaded, so writing that row into the list would blank out the item's options picker —
 *  and after N taps the flipped-N-times cache already holds the same answer the server does. The
 *  refetch still happens, once the whole burst of taps has settled, purely to pick up a pin
 *  another till may have changed; by then the icon is long since correct, so it costs no wait.
 *  Only the menu list is touched — pinning changes nothing about what sells, so best-sellers is
 *  left alone. */
export const useToggleMenuPinned = () => {
  const qc = useQueryClient();
  const flipPinned = (id: number) =>
    qc.setQueryData<MenuItem[]>(queryKeys.menu, (prev) =>
      prev?.map((item) => (item.id === id ? { ...item, pinned: !item.pinned } : item)),
    );

  return useMutation({
    mutationFn: (id: number) => menuApi.togglePinned(id),
    onMutate: async (id) => {
      // Claim the ticket before the first await, so tickets are ordered by tap, not by
      // whichever cancelQueries happens to resume first.
      const tap = ++pinTapCount;
      latestPinTap.set(id, tap);
      // A menu refetch already in flight would otherwise land after this and undo the flip.
      await qc.cancelQueries({ queryKey: queryKeys.menu });
      flipPinned(id);
      return { tap };
    },
    // Flip just this item back rather than restoring a whole snapshot: another item's pin may
    // have been tapped while this request was out, and that one shouldn't be undone as well.
    onError: (_err, id) => flipPinned(id),
    onSettled: (_item, _err, id, ctx) => {
      if (latestPinTap.get(id) !== ctx?.tap) return; // A later tap owns the resync.
      latestPinTap.delete(id);
      qc.invalidateQueries({ queryKey: queryKeys.menu });
    },
  });
};

export const useDeleteMenuItem = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => menuApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.menu });
      qc.invalidateQueries({ queryKey: queryKeys.bestSellers });
    },
  });
};

export const useDeleteAllMenuItems = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => menuApi.removeAll(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.menu });
      qc.invalidateQueries({ queryKey: queryKeys.bestSellers });
    },
  });
};

export const useMenuItemImages = (menuItemId: number | null) =>
  useQuery({
    queryKey: ['menu-item-images', menuItemId],
    queryFn: () => menuApi.listImages(menuItemId as number),
    enabled: menuItemId !== null,
  });

export const useAddMenuItemImage = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ menuItemId, dataUri }: { menuItemId: number; dataUri: string }) => menuApi.addImage(menuItemId, dataUri),
    onSuccess: (_, { menuItemId }) => qc.invalidateQueries({ queryKey: ['menu-item-images', menuItemId] }),
  });
};

export const useRemoveMenuItemImage = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ menuItemId, imageId }: { menuItemId: number; imageId: number }) => menuApi.removeImage(menuItemId, imageId),
    onSuccess: (_, { menuItemId }) => qc.invalidateQueries({ queryKey: ['menu-item-images', menuItemId] }),
  });
};

// ========== VARIANTS (Half/Full) ==========

export const useVariants = (menuItemId: number | null) =>
  useQuery({
    queryKey: ['variants', menuItemId],
    queryFn: () => menuApi.listVariants(menuItemId as number),
    enabled: menuItemId !== null,
  });

export const useCreateVariant = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ menuItemId, req }: { menuItemId: number; req: CreateVariantRequest }) =>
      menuApi.createVariant(menuItemId, req),
    onSuccess: (_, { menuItemId }) => {
      qc.invalidateQueries({ queryKey: ['variants', menuItemId] });
      qc.invalidateQueries({ queryKey: queryKeys.menu });
    },
  });
};

export const useUpdateVariant = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ menuItemId, variantId, req }: { menuItemId: number; variantId: number; req: UpdateVariantRequest }) =>
      menuApi.updateVariant(menuItemId, variantId, req),
    onSuccess: (_, { menuItemId }) => {
      qc.invalidateQueries({ queryKey: ['variants', menuItemId] });
      qc.invalidateQueries({ queryKey: queryKeys.menu });
    },
  });
};

export const useDeleteVariant = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ menuItemId, variantId }: { menuItemId: number; variantId: number }) =>
      menuApi.deleteVariant(menuItemId, variantId),
    onSuccess: (_, { menuItemId }) => {
      qc.invalidateQueries({ queryKey: ['variants', menuItemId] });
      qc.invalidateQueries({ queryKey: queryKeys.menu });
    },
  });
};

// ========== MODIFIERS (Spice, Add-ons) ==========

export const useModifiers = (menuItemId: number | null) =>
  useQuery({
    queryKey: ['modifiers', menuItemId],
    queryFn: () => menuApi.listModifiers(menuItemId as number),
    enabled: menuItemId !== null,
  });

export const useCreateModifier = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ menuItemId, name, type, isRequired }: { menuItemId: number; name: string; type: string; isRequired: boolean }) =>
      menuApi.createModifier(menuItemId, { name, type, isRequired }),
    onSuccess: (_, { menuItemId }) => {
      qc.invalidateQueries({ queryKey: ['modifiers', menuItemId] });
    },
  });
};

export const useUpdateModifier = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ menuItemId, modifierId, name, type, isRequired }: { menuItemId: number; modifierId: number; name?: string; type?: string; isRequired?: boolean }) =>
      menuApi.updateModifier(menuItemId, modifierId, { name, type, isRequired }),
    onSuccess: (_, { menuItemId }) => {
      qc.invalidateQueries({ queryKey: ['modifiers', menuItemId] });
    },
  });
};

export const useDeleteModifier = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ menuItemId, modifierId }: { menuItemId: number; modifierId: number }) =>
      menuApi.deleteModifier(menuItemId, modifierId),
    onSuccess: (_, { menuItemId }) => {
      qc.invalidateQueries({ queryKey: ['modifiers', menuItemId] });
    },
  });
};

export const useModifierOptions = (menuItemId: number | null, modifierId: number | null) =>
  useQuery({
    queryKey: ['modifier-options', menuItemId, modifierId],
    queryFn: () => menuApi.listModifierOptions(menuItemId as number, modifierId as number),
    enabled: menuItemId !== null && modifierId !== null,
  });

export const useCreateModifierOption = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ menuItemId, modifierId, name, price }: { menuItemId: number; modifierId: number; name: string; price: number }) =>
      menuApi.createModifierOption(menuItemId, modifierId, { name, price }),
    onSuccess: (_, { menuItemId, modifierId }) => {
      qc.invalidateQueries({ queryKey: ['modifier-options', menuItemId, modifierId] });
    },
  });
};

export const useUpdateModifierOption = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ menuItemId, modifierId, optionId, name, price }: { menuItemId: number; modifierId: number; optionId: number; name?: string; price?: number }) =>
      menuApi.updateModifierOption(menuItemId, modifierId, optionId, { name, price }),
    onSuccess: (_, { menuItemId, modifierId }) => {
      qc.invalidateQueries({ queryKey: ['modifier-options', menuItemId, modifierId] });
    },
  });
};

export const useDeleteModifierOption = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ menuItemId, modifierId, optionId }: { menuItemId: number; modifierId: number; optionId: number }) =>
      menuApi.deleteModifierOption(menuItemId, modifierId, optionId),
    onSuccess: (_, { menuItemId, modifierId }) => {
      qc.invalidateQueries({ queryKey: ['modifier-options', menuItemId, modifierId] });
    },
  });
};

// ========== CHANNEL VISIBILITY ==========

export const useChannelVisibility = (menuItemId: number | null) =>
  useQuery({
    queryKey: ['channel-visibility', menuItemId],
    queryFn: () => menuApi.getChannelVisibility(menuItemId as number),
    enabled: menuItemId !== null,
  });

export const useSetChannelVisibility = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ menuItemId, req }: { menuItemId: number; req: SetChannelVisibilityRequest }) =>
      menuApi.setChannelVisibility(menuItemId, req),
    onSuccess: (_, { menuItemId }) => {
      qc.invalidateQueries({ queryKey: ['channel-visibility', menuItemId] });
      qc.invalidateQueries({ queryKey: queryKeys.menu });
    },
  });
};

// ========== MENU SCHEDULING ==========

export const useMenuSchedules = (menuItemId: number | null) =>
  useQuery({
    queryKey: ['menu-schedules', menuItemId],
    queryFn: () => menuApi.getSchedules(menuItemId as number),
    enabled: menuItemId !== null,
  });

export const useCreateMenuSchedule = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ menuItemId, req }: { menuItemId: number; req: CreateMenuScheduleRequest }) =>
      menuApi.createSchedule(menuItemId, req),
    onSuccess: (_, { menuItemId }) => {
      qc.invalidateQueries({ queryKey: ['menu-schedules', menuItemId] });
      qc.invalidateQueries({ queryKey: queryKeys.menu });
    },
  });
};

export const useDeleteMenuSchedule = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ menuItemId, scheduleId }: { menuItemId: number; scheduleId: number }) =>
      menuApi.deleteSchedule(menuItemId, scheduleId),
    onSuccess: (_, { menuItemId }) => {
      qc.invalidateQueries({ queryKey: ['menu-schedules', menuItemId] });
      qc.invalidateQueries({ queryKey: queryKeys.menu });
    },
  });
};

// ========== PRICE CHANGE LOGGING ==========

export const usePriceHistory = (menuItemId: number | null) =>
  useQuery({
    queryKey: ['price-history', menuItemId],
    queryFn: () => menuApi.getPriceHistory(menuItemId as number),
    enabled: menuItemId !== null,
  });

export const useLogPriceChange = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ menuItemId, req }: { menuItemId: number; req: LogPriceChangeRequest }) =>
      menuApi.logPriceChange(menuItemId, req),
    onSuccess: (_, { menuItemId }) => {
      qc.invalidateQueries({ queryKey: ['price-history', menuItemId] });
      qc.invalidateQueries({ queryKey: queryKeys.menu });
    },
  });
};
