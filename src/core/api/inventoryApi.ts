import { apiClient } from '../network/api';

export interface InventoryItem {
  id: number;
  name: string;
  category: string;
  icon: string;
  current: number;
  max: number;
  unit: string;
  dailyUsage: number;
  lastRestockAt: string | null;
  unitCost: number;
  minStock: number;
  reorderLevel: number;
  /** Server-computed: current <= reorderLevel. Replaces the old client-side ratio guess. */
  lowStock: boolean;
  branchId: number | null;
  /** False once deleted (soft-delete) — list()/lowStock() hide these by default; pass
   * includeInactive to see them. Recipes/history referencing this id keep working either way. */
  isActive: boolean;
}

export interface CreateInventoryItemRequest {
  name: string;
  category: string;
  max: number;
  unit?: string;
  unitCost?: number;
  minStock?: number;
  reorderLevel?: number;
  branchId?: number | null;
  /** ISO yyyy-MM-dd — the item's very first batch, if it has a shelf life. */
  expiryDate?: string;
}

/** Edits the item's own details. No `current` — stock only moves through restock/waste/
 * adjust so every change keeps a ledger entry. No `branchId` — batches and transactions are
 * already booked against the item's branch. */
export interface UpdateInventoryItemRequest {
  name: string;
  category: string;
  max: number;
  unit?: string;
  unitCost?: number;
  minStock?: number;
  reorderLevel?: number;
}

export interface RestockRequest {
  quantity: number;
  unitCost?: number;
  /** ISO yyyy-MM-dd — this restock's own lot, if it has a shelf life. */
  expiryDate?: string;
}

/** One row of a bulk stock/rate sheet. `currentStock` is a physical count — it SETS the
 * figure rather than adding to it, so re-uploading the same sheet doesn't double stock.
 * `unitCost` is the rate per `unit`; both convert if `unit` differs from the item's
 * stored one (500/kg on a gm-based item becomes 0.5/gm). */
export interface InventoryImportRow {
  name: string;
  unit: string;
  currentStock: number;
  unitCost: number;
  category?: string;
  maxStock?: number;
  reorderLevel?: number;
}

export interface InventoryImportRowError {
  rowNumber: number;
  name: string;
  reason: string;
}

export interface InventoryImportResult {
  itemsCreated: number;
  itemsUpdated: number;
  rowsWithErrors: number;
  errors: InventoryImportRowError[];
}

/** One physical lot — see CafePOS.Api.Domain.InventoryBatch. DaysUntilExpiry is negative
 * once past expiryDate (isExpired true); null for a batch with no expiry at all. */
export interface InventoryBatch {
  id: number;
  inventoryItemId: number;
  inventoryItemName: string;
  unit: string;
  quantity: number;
  unitCost: number;
  expiryDate: string | null;
  receivedAt: string;
  daysUntilExpiry: number | null;
  isExpired: boolean;
}

/** Matches CafePOS.Api.Domain.WasteReason exactly — the API serializes enums as strings. */
export type WasteReasonCode = 'Spoiled' | 'Expired' | 'Burnt' | 'Spilled' | 'TrialTasting' | 'StaffMeal' | 'Complimentary' | 'Broken' | 'Other';

export const WASTE_REASON_LABELS: Record<WasteReasonCode, string> = {
  Spoiled: 'Spoiled',
  Expired: 'Expired',
  Burnt: 'Burnt',
  Spilled: 'Spilled',
  TrialTasting: 'Trial / Tasting',
  StaffMeal: 'Staff Meal',
  Complimentary: 'Complimentary',
  Broken: 'Broken',
  Other: 'Other',
};

export interface WasteRequest {
  quantity: number;
  reason: WasteReasonCode;
  note?: string;
}

export interface AdjustStockRequest {
  newQuantity: number;
  reason?: string;
}

export type InventoryTransactionType = 'Purchase' | 'Sale' | 'ManualAdjustment' | 'Waste' | 'Expired' | 'Return' | 'Transfer';

export interface InventoryTransaction {
  id: number;
  inventoryItemId: number;
  inventoryItemName: string;
  type: InventoryTransactionType;
  previousStock: number;
  changedQuantity: number;
  remainingStock: number;
  reason: string | null;
  wasteReasonCode: WasteReasonCode | null;
  referenceId: string | null;
  userName: string;
  createdAt: string;
  branchId: number | null;
}

export interface TransactionsFilter {
  types?: InventoryTransactionType[];
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  branchId?: number | null;
  pageNumber?: number;
  pageSize?: number;
  sortBy?: 'date' | 'item' | 'user';
  sortOrder?: 'asc' | 'desc';
}

export interface TransactionsPagedResult {
  items: InventoryTransaction[];
  totalItems: number;
  totalPages: number;
  pageNumber: number;
  pageSize: number;
}

export interface PurchaseItemRequest {
  inventoryItemId: number;
  quantity: number;
  unit: string;
  /** Expected/quoted cost, if known — optional, since the real price isn't confirmed until receiving. */
  unitCost?: number;
}

export interface CreatePurchaseOrderRequest {
  /** Links a Vendor master record — preferred over the free-text supplierName below. */
  vendorId?: number;
  supplierName?: string;
  note?: string;
  items: PurchaseItemRequest[];
}

export type PurchaseOrderStatus = 'ORDERED' | 'RECEIVED' | 'CANCELLED';

export interface ReceivePurchaseItemRequest {
  purchaseItemId: number;
  receivedQuantity: number;
  unitCost: number;
  /** ISO yyyy-MM-dd — this line's own lot, if it has a shelf life. */
  expiryDate?: string;
}

/** Every line item on the order must be covered — partial receipt isn't supported yet. */
export interface ReceivePurchaseOrderRequest {
  items: ReceivePurchaseItemRequest[];
}

export interface PurchaseOrder {
  id: number;
  vendorId: number | null;
  supplierName: string | null;
  /** Set only when vendorId is linked and that vendor has a phone on file. */
  vendorPhone: string | null;
  note: string | null;
  status: PurchaseOrderStatus;
  createdByName: string;
  createdAt: string;
  receivedAt: string | null;
  receivedByName: string | null;
  items: {
    purchaseItemId: number;
    inventoryItemId: number;
    inventoryItemName: string;
    quantity: number;
    unit: string;
    /** Null until Received — no confirmed price at order time. */
    unitCost: number | null;
    expiryDate: string | null;
    /** Null until Received; may differ from quantity (short/over shipment). */
    receivedQuantity: number | null;
  }[];
}

export const inventoryApi = {
  list: (branchId?: number | null, includeInactive?: boolean) =>
    apiClient.get<InventoryItem[]>('/inventory', { params: { branchId, includeInactive } }).then((r) => r.data),
  lowStock: () => apiClient.get<InventoryItem[]>('/inventory/low-stock').then((r) => r.data),
  create: (req: CreateInventoryItemRequest) => apiClient.post<InventoryItem>('/inventory', req).then((r) => r.data),
  update: (id: number, req: UpdateInventoryItemRequest) => apiClient.put<InventoryItem>(`/inventory/${id}`, req).then((r) => r.data),
  restock: (id: number, req: RestockRequest) => apiClient.post<InventoryItem>(`/inventory/${id}/restock`, req).then((r) => r.data),
  logWaste: (id: number, req: WasteRequest) => apiClient.post<InventoryItem>(`/inventory/${id}/waste`, req).then((r) => r.data),
  adjust: (id: number, req: AdjustStockRequest) => apiClient.post<InventoryItem>(`/inventory/${id}/adjust`, req).then((r) => r.data),
  bulkImport: (rows: InventoryImportRow[], branchId?: number | null) =>
    apiClient.post<InventoryImportResult>('/inventory/bulk-import', rows, { params: { branchId } }).then((r) => r.data),
  remove: (id: number) => apiClient.delete<void>(`/inventory/${id}`).then((r) => r.data),
  reactivate: (id: number) => apiClient.post<InventoryItem>(`/inventory/${id}/reactivate`).then((r) => r.data),
  transactions: (filter?: TransactionsFilter) =>
    apiClient.get<TransactionsPagedResult | InventoryTransaction[]>('/inventory/transactions', {
      params: {
        types: filter?.types?.join(','),
        dateFrom: filter?.dateFrom,
        dateTo: filter?.dateTo,
        search: filter?.search,
        branchId: filter?.branchId,
        pageNumber: filter?.pageNumber ?? 1,
        pageSize: filter?.pageSize ?? 50,
        sortBy: filter?.sortBy ?? 'date',
        sortOrder: filter?.sortOrder ?? 'desc',
      }
    }).then((r) => r.data),
  itemTransactions: (id: number, filter?: TransactionsFilter) =>
    apiClient.get<InventoryTransaction[]>(`/inventory/${id}/transactions`, {
      params: {
        types: filter?.types?.join(','),
        dateFrom: filter?.dateFrom,
        dateTo: filter?.dateTo,
        search: filter?.search,
        sortBy: filter?.sortBy ?? 'date',
        sortOrder: filter?.sortOrder ?? 'desc',
      }
    }).then((r) => r.data),
  createPurchaseOrder: (req: CreatePurchaseOrderRequest) => apiClient.post<PurchaseOrder>('/purchase-orders', req).then((r) => r.data),
  /** No branchId param — PurchaseOrder/PurchaseItem have no BranchId column in this schema. */
  listPurchaseOrders: (params?: { from?: string; to?: string; status?: PurchaseOrderStatus; vendorId?: number }) =>
    apiClient.get<PurchaseOrder[]>('/purchase-orders', { params }).then((r) => r.data),
  receivePurchaseOrder: (id: number, req: ReceivePurchaseOrderRequest) => apiClient.post<PurchaseOrder>(`/purchase-orders/${id}/receive`, req).then((r) => r.data),
  cancelPurchaseOrder: (id: number) => apiClient.post<PurchaseOrder>(`/purchase-orders/${id}/cancel`).then((r) => r.data),
  getBatches: (id: number) => apiClient.get<InventoryBatch[]>(`/inventory/${id}/batches`).then((r) => r.data),
  expiringBatches: (days?: number) => apiClient.get<InventoryBatch[]>('/inventory/expiring', { params: { days } }).then((r) => r.data),
};
