import { apiClient } from '../network/api';

export type PayrollRunStatus = 'DRAFT' | 'LOCKED' | 'PAID';
export type PayrollSalaryType = 'MONTHLY' | 'DAILY' | 'HOURLY';

export interface AllowanceLine {
  name: string;
  amount: number;
}

export interface PayrollLine {
  id: number;
  payrollRunId: number;
  staffId: number;
  staffName: string;
  salaryType: PayrollSalaryType;
  basicSalary: number;
  hourlyRate: number | null;
  presentDays: number;
  lateDays: number;
  halfDays: number;
  absentDays: number;
  paidLeaveDays: number;
  unpaidLeaveDays: number;
  overtimeHours: number;
  overtimePay: number;
  allowances: AllowanceLine[];
  allowancesTotal: number;
  grossEarnings: number;
  leaveDeduction: number;
  lateDeduction: number;
  loanDeduction: number;
  pfDeduction: number;
  esicDeduction: number;
  professionalTaxDeduction: number;
  totalDeductions: number;
  netSalary: number;
  isEdited: boolean;
}

export interface PayrollRun {
  id: number;
  periodStart: string;
  periodEnd: string;
  status: PayrollRunStatus;
  generatedAt: string;
  generatedByName: string;
  lockedAt: string | null;
  paidAt: string | null;
  notes: string | null;
  totalNetSalary: number;
  staffCount: number;
  lines: PayrollLine[] | null;
}

export interface GeneratePayrollRunRequest {
  periodStart: string;
  periodEnd: string;
}

export interface UpdatePayrollLineRequest {
  allowances?: AllowanceLine[];
  lateDeduction?: number;
  pfDeduction?: number;
  esicDeduction?: number;
  professionalTaxDeduction?: number;
}

export const payrollApi = {
  list: (year?: number, month?: number) => apiClient.get<PayrollRun[]>('/payroll-runs', { params: { year, month } }).then((r) => r.data),
  get: (id: number) => apiClient.get<PayrollRun>(`/payroll-runs/${id}`).then((r) => r.data),
  generate: (req: GeneratePayrollRunRequest) => apiClient.post<PayrollRun>('/payroll-runs/generate', req).then((r) => r.data),
  updateLine: (runId: number, lineId: number, req: UpdatePayrollLineRequest) =>
    apiClient.patch<PayrollLine>(`/payroll-runs/${runId}/lines/${lineId}`, req).then((r) => r.data),
  remove: (id: number) => apiClient.delete<void>(`/payroll-runs/${id}`).then((r) => r.data),
  lock: (id: number) => apiClient.post<PayrollRun>(`/payroll-runs/${id}/lock`).then((r) => r.data),
  reopen: (id: number) => apiClient.post<PayrollRun>(`/payroll-runs/${id}/reopen`).then((r) => r.data),
  markPaid: (id: number) => apiClient.post<PayrollRun>(`/payroll-runs/${id}/mark-paid`).then((r) => r.data),
  payslipPdfPath: (runId: number, lineId: number) => `/payroll-runs/${runId}/lines/${lineId}/payslip.pdf`,
  bankExportPath: (runId: number) => `/payroll-runs/${runId}/bank-export.csv`,
  myPayslips: (year?: number) => apiClient.get<PayrollLine[]>('/payroll/me/payslips', { params: { year } }).then((r) => r.data),
  myPayslipPdfPath: (lineId: number) => `/payroll/me/payslips/${lineId}/pdf`,
};
