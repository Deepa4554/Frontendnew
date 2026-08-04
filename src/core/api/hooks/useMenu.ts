import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  menuApi,
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
