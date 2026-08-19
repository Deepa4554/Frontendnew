import { apiClient } from '../network/api';

export interface ApiTable {
  id: number;
  code: string;
  zone: string;
  seats: number;
  status: 'empty' | 'occupied';
  orderId: number | null;
  /** The cafe's own bill number, pre-formatted ("#7"). Null when the table is empty, and
   * absent from a deployed API build that predates per-tenant bill numbering — call sites
   * must tolerate undefined. Never rebuild this from `orderId`: the id is a sequence shared
   * by every tenant, which is what used to print a new cafe's first table as "Order #1455". */
  orderNumber?: string | null;
  orderStatus: string | null;
  bill: number | null;
  guestName: string | null;
  guestPhone: string | null;
  /** Encrypted (tenant, table) token for the QR ordering link — never the tenant or
   * table code in plain text. See backend QrTokenService. */
  qrToken: string;
  /** A live QR guest session on this table, if any — informational only. Doesn't affect
   * `status` above (that stays order-based, unchanged): a guest can have an ACTIVE
   * session before ever placing an order, so this can be non-null on an "empty" tile
   * too. See backend GuestSessionController / TablesController.GetSession. */
  activeSessionId: number | null;
  /** This table's own seats when standalone, or the summed total across every table
   * currently merged into it (see mergedWith) — a table's own `seats` field is never
   * mutated by merging, so this is always the right number to display. Optional: absent
   * from a deployed API build that predates table-merge (see mergedWith below). */
  mergedSeats?: number;
  /** Every table currently merged into this one (empty when none) — a table that is
   * itself merged into another one never appears in the list at all. `id` is what
   * `unmerge()` takes. See backend TablesController.Merge/Unmerge. Optional: a deployed
   * API build that predates this feature won't send it at all — every call site must
   * fall back to [] rather than assume it's always present. */
  mergedWith?: { id: number; code: string }[];
}

export interface CreateTableRequest {
  zone: string;
  seats: number;
  /** The table's display name on the floor plan (e.g. "T9", "Corner Booth"). Optional —
   * omitted/blank, the server auto-numbers the next "T{n}". Must be unique within the cafe;
   * a clash comes back as a 409 with a readable message. See backend TablesController.Create. */
  code?: string;
}

export interface UpdateTableRequest {
  /** New display name. Omit to leave it alone. Renaming is refused by the server while the
   * table has an open order (409) — see backend TablesController.Update. */
  code?: string;
  zone?: string;
  seats?: number;
}

export interface UpdateTableResponse {
  table: ApiTable;
  /** True when the name changed, which silently breaks every QR sticker already taped to
   * that table: a table QR encodes the table's CODE, not its id, so old stickers now decode
   * to a name no table has. The UI must tell staff to reprint — nothing server-side can fix
   * a sticker that is physically on a table. */
  qrCodeInvalidated: boolean;
}

export const tablesApi = {
  list: () => apiClient.get<ApiTable[]>('/tables').then((r) => r.data),
  create: (req: CreateTableRequest) => apiClient.post<ApiTable>('/tables', req).then((r) => r.data),
  update: (id: number, req: UpdateTableRequest) =>
    apiClient.put<UpdateTableResponse>(`/tables/${id}`, req).then((r) => r.data),
  remove: (id: number) => apiClient.delete<void>(`/tables/${id}`).then((r) => r.data),
  /** A QR token not tied to any table — for browsing/ordering as takeaway, or when
   * every table is occupied. See backend TablesController.GetMenuOnlyQrToken. */
  getMenuOnlyQrToken: () => apiClient.get<{ token: string }>('/tables/menu-qr-token').then((r) => r.data),
  /** A QR token for home delivery — printed on flyers/packaging rather than a table.
   * Scanning it opens the ordering page in delivery mode (address + location), and the
   * order arrives as DELIVERY. See backend TablesController.GetDeliveryQrToken. */
  getDeliveryQrToken: () => apiClient.get<{ token: string }>('/tables/delivery-qr-token').then((r) => r.data),
  /** Manual end of a table's live QR guest session (doc Section 5.6) — abuse, a
   * wrong-table scan, or a guest request. Every device on that session gets 410 on its
   * next request. */
  revokeSession: (tableId: number, reason?: string) =>
    apiClient.post<void>(`/tables/${tableId}/session/revoke`, { reason: reason ?? null }).then((r) => r.data),
  /** Folds `id` (must currently be empty) into `targetHostTableId` (must also currently be
   * empty) — combined seating for a party bigger than one table, before anyone's ordered
   * anything. See backend TablesController.Merge. */
  merge: (id: number, targetHostTableId: number) =>
    apiClient.post<void>(`/tables/${id}/merge`, { targetHostTableId }).then((r) => r.data),
  /** Splits a merged-in table back out to standalone. */
  unmerge: (id: number) => apiClient.post<void>(`/tables/${id}/unmerge`).then((r) => r.data),
};
