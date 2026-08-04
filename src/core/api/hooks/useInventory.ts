import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  inventoryApi,
  CreateInventoryItemRequest,
  UpdateInventoryItemRequest,
  RestockRequest,
  WasteRequest,
  AdjustStockRequest,
  CreatePurchaseOrderRequest,
  ReceivePurchaseOrderRequest,
  TransactionsFilter,
  TransactionsPagedResult,
  InventoryImportRow,
  PurchaseOrderStatus,
} from '../inventoryApi';
import { queryKeys } from './queryKeys';

/** `includeInactive` also returns soft-deleted items (isActive false) so they can be
 * reviewed and reactivated — the default list hides them. */
export const useInventory = (branchId?: number | null, includeInactive?: boolean) =>
  useQuery({
    queryKey: queryKeys.inventory(branchId, includeInactive),
    queryFn: () => inventoryApi.list(branchId, includeInactive),
  });

export const useLowStockInventory = () => useQuery({ queryKey: queryKeys.lowStockInventory, queryFn: inventoryApi.lowStock });

const invalidateInventory = (qc: ReturnType<typeof useQueryClient>) => {
  qc.invalidateQueries({ queryKey: ['inventory'] });
  qc.invalidateQueries({ queryKey: queryKeys.lowStockInventory });
  qc.invalidateQueries({ queryKey: ['inventory', 'transactions'] });
  qc.invalidateQueries({ queryKey: ['inventory-batches'] });
  qc.invalidateQueries({ queryKey: ['inventory-expiring'] });
};

export const useCreateInventoryItem = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: CreateInventoryItemRequest) => inventoryApi.create(req),
    onSuccess: () => invalidateInventory(qc),
  });
};

export const useUpdateInventoryItem = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, req }: { id: number; req: UpdateInventoryItemRequest }) => inventoryApi.update(id, req),
    onSuccess: () => invalidateInventory(qc),
  });
};

export const useRestockInventoryItem = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, req }: { id: number; req: RestockRequest }) => inventoryApi.restock(id, req),
    onSuccess: () => invalidateInventory(qc),
  });
};

export const useLogWaste = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, req }: { id: number; req: WasteRequest }) => inventoryApi.logWaste(id, req),
    onSuccess: () => invalidateInventory(qc),
  });
};

export const useAdjustStock = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, req }: { id: number; req: AdjustStockRequest }) => inventoryApi.adjust(id, req),
    onSuccess: () => invalidateInventory(qc),
  });
};

/** One sheet can create and re-count many items at once, so this leans on the same broad
 * invalidation as every other stock movement rather than tracking which ids it touched. */
export const useBulkImportInventory = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ rows, branchId }: { rows: InventoryImportRow[]; branchId?: number | null }) =>
      inventoryApi.bulkImport(rows, branchId),
    onSuccess: () => invalidateInventory(qc),
  });
};

export const useDeleteInventoryItem = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => inventoryApi.remove(id),
    onSuccess: () => invalidateInventory(qc),
  });
};

export const useReactivateInventoryItem = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => inventoryApi.reactivate(id),
    onSuccess: () => invalidateInventory(qc),
  });
};

export const useInventoryTransactions = (filter?: TransactionsFilter) =>
  useQuery({
    queryKey: queryKeys.inventoryTransactions(filter),
    queryFn: () => inventoryApi.transactions(filter),
  });

export const useInventoryItemTransactions = (id: number | null, filter?: TransactionsFilter) =>
  useQuery({
    queryKey: queryKeys.inventoryItemTransactions(id ?? -1, filter),
    queryFn: () => inventoryApi.itemTransactions(id as number, filter),
    enabled: id !== null,
  });

/** Passing no `params` keeps the original operational-screen behaviour (query key
 * unchanged, no filters sent) — the Purchase Report screen passes from/to/status/vendorId
 * to get a distinct, cached, filtered result instead. */
export const usePurchaseOrders = (params?: { from?: string; to?: string; status?: PurchaseOrderStatus; vendorId?: number }) =>
  useQuery({ queryKey: params ? (['purchase-orders', params] as const) : queryKeys.purchaseOrders, queryFn: () => inventoryApi.listPurchaseOrders(params) });

export const useCreatePurchaseOrder = () => {
  const qc = useQueryClient();
  return useMutation({
    // Placing an order doesn't touch stock (see PurchaseOrdersController.Create) — only
    // the purchase-orders list needs to refresh, not inventory.
    mutationFn: (req: CreatePurchaseOrderRequest) => inventoryApi.createPurchaseOrder(req),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.purchaseOrders }),
  });
};

export const useReceivePurchaseOrder = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, req }: { id: number; req: ReceivePurchaseOrderRequest }) => inventoryApi.receivePurchaseOrder(id, req),
    onSuccess: () => {
      invalidateInventory(qc);
      qc.invalidateQueries({ queryKey: queryKeys.purchaseOrders });
    },
  });
};

export const useCancelPurchaseOrder = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => inventoryApi.cancelPurchaseOrder(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.purchaseOrders }),
  });
};

export const useInventoryBatches = (id: number | null) =>
  useQuery({
    queryKey: queryKeys.inventoryBatches(id ?? -1),
    queryFn: () => inventoryApi.getBatches(id as number),
    enabled: id !== null,
  });

export const useExpiringBatches = (days?: number) =>
  useQuery({ queryKey: queryKeys.expiringBatches(days), queryFn: () => inventoryApi.expiringBatches(days) });
