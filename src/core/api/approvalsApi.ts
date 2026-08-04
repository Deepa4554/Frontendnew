import { apiClient } from '../network/api';

export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'ESCALATED';
export type ApprovalType = 'REFUND' | 'DISCOUNT' | 'EXPENSE' | 'SALARY' | 'INVENTORY_ADJUSTMENT' | 'STOCK_TRANSFER' | 'LEAVE';

export interface ApiApproval {
  id: number;
  type: ApprovalType;
  requestedById: number;
  assignedToId: number;
  title: string;
  description: string;
  amount: number | null;
  currency: string;
  status: ApprovalStatus;
  level: number;
  createdAt: string;
  resolvedAt: string | null;
  notes: string | null;
}

export interface SubmitApprovalRequest {
  type: 'Refund' | 'Discount' | 'Expense' | 'Salary' | 'InventoryAdjustment' | 'StockTransfer' | 'Leave';
  assignedToId: number;
  title: string;
  description: string;
  amount?: number;
  currency?: string;
  level?: number;
}

export const approvalsApi = {
  list: (params?: { status?: ApprovalStatus; assignedToId?: number }) => apiClient.get<ApiApproval[]>('/approvals', { params }).then((r) => r.data),
  submit: (req: SubmitApprovalRequest) => apiClient.post<ApiApproval>('/approvals', req).then((r) => r.data),
  approve: (id: number, notes?: string) => apiClient.patch<ApiApproval>(`/approvals/${id}/approve`, { notes }).then((r) => r.data),
  reject: (id: number, notes?: string) => apiClient.patch<ApiApproval>(`/approvals/${id}/reject`, { notes }).then((r) => r.data),
  escalate: (id: number) => apiClient.patch<ApiApproval>(`/approvals/${id}/escalate`).then((r) => r.data),
};
