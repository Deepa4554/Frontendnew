import { apiClient } from '../network/api';

export type LoanType = 'ADVANCE' | 'LOAN';
export type LoanStatus = 'ACTIVE' | 'CLOSED';

export interface StaffLoan {
  id: number;
  staffId: number;
  staffName: string;
  type: LoanType;
  principalAmount: number;
  monthlyDeduction: number;
  startDate: string;
  status: LoanStatus;
  outstandingBalance: number;
  reason: string | null;
  approvedByName: string;
  createdAt: string;
  closedAt: string | null;
}

export interface CreateStaffLoanRequest {
  staffId: number;
  type: 'Advance' | 'Loan';
  principalAmount: number;
  monthlyDeduction: number;
  startDate?: string;
  reason?: string;
}

export interface UpdateStaffLoanRequest {
  monthlyDeduction?: number;
  reason?: string;
}

export const loansApi = {
  list: (staffId?: number, status?: LoanStatus) => apiClient.get<StaffLoan[]>('/staff-loans', { params: { staffId, status } }).then((r) => r.data),
  me: () => apiClient.get<StaffLoan[]>('/staff-loans/me').then((r) => r.data),
  create: (req: CreateStaffLoanRequest) => apiClient.post<StaffLoan>('/staff-loans', req).then((r) => r.data),
  update: (id: number, req: UpdateStaffLoanRequest) => apiClient.patch<StaffLoan>(`/staff-loans/${id}`, req).then((r) => r.data),
  close: (id: number) => apiClient.post<StaffLoan>(`/staff-loans/${id}/close`).then((r) => r.data),
};
