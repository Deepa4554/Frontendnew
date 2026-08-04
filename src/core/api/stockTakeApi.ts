import { apiClient } from '../network/api';

export type StockTakeStatus = 'DRAFT' | 'FINALIZED';

export interface StockTakeLine {
  id: number;
  inventoryItemId: number;
  inventoryItemName: string;
  unit: string;
  /** InventoryItem.current snapshotted when the stock take was created. */
  systemQty: number;
  /** Null until staff record a count for this line — partial counts allowed. */
  countedQty: number | null;
  /** countedQty - systemQty, set only once the stock take is finalized. */
  variance: number | null;
}

export interface StockTake {
  id: number;
  status: StockTakeStatus;
  branchId: number | null;
  note: string | null;
  createdByName: string;
  createdAt: string;
  finalizedAt: string | null;
  finalizedByName: string | null;
  lines: StockTakeLine[];
}

export interface CreateStockTakeRequest {
  branchId?: number | null;
  note?: string;
}

export const stockTakeApi = {
  list: () => apiClient.get<StockTake[]>('/stock-takes').then((r) => r.data),
  get: (id: number) => apiClient.get<StockTake>(`/stock-takes/${id}`).then((r) => r.data),
  create: (req: CreateStockTakeRequest) => apiClient.post<StockTake>('/stock-takes', req).then((r) => r.data),
  recordCount: (id: number, lineId: number, countedQty: number) =>
    apiClient.patch<StockTake>(`/stock-takes/${id}/lines/${lineId}`, { countedQty }).then((r) => r.data),
  /** One-way — writes ManualAdjustment ledger rows for every counted line that differs
   * from the ingredient's live balance, then locks the stock take. */
  finalize: (id: number) => apiClient.post<StockTake>(`/stock-takes/${id}/finalize`).then((r) => r.data),
  remove: (id: number) => apiClient.delete<void>(`/stock-takes/${id}`).then((r) => r.data),
};
