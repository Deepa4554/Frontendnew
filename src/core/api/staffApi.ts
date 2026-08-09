import { apiClient } from '../network/api';

export type StaffStatus = 'ACTIVE' | 'SUSPENDED' | 'ON_LEAVE' | 'TERMINATED';

export type LoginRole = 'Owner' | 'Manager' | 'Cashier' | 'Chef' | 'Waiter' | 'KitchenStaff' | 'Accountant';

/** Excludes Owner deliberately — only an existing Owner is allowed to grant another Owner
 * login (enforced by the backend too), so screens that let any Owner/Manager add staff
 * splice 'Owner' in themselves, gated on the current user's own role. See
 * StaffProfileScreen/TeamOverviewScreen's roleOptions. */
export const LOGIN_ROLES: LoginRole[] = ['Manager', 'Cashier', 'Chef', 'Waiter', 'KitchenStaff', 'Accountant'];
export const LOGIN_ROLE_LABEL: Record<LoginRole, string> = {
  Owner: 'Owner',
  Manager: 'Manager',
  Cashier: 'Cashier',
  Chef: 'Chef',
  Waiter: 'Waiter',
  KitchenStaff: 'Kitchen Staff',
  Accountant: 'Accountant',
};

/** Common cafe job titles for the Add Staff "Role" picker — free text let anyone type
 * anything, which fragmented reporting/filtering across near-duplicate roles (e.g.
 * "Barista" vs "barista" vs "Coffee Maker"). "Other" still allows a custom title. */
export const STAFF_ROLE_OPTIONS = [
  'Barista', 'Waiter', 'Cashier', 'Chef', 'Kitchen Staff', 'Cleaner', 'Delivery', 'Manager', 'Accountant', 'Other',
] as const;

export type SalaryType = 'MONTHLY' | 'DAILY' | 'HOURLY';

export interface ApiStaff {
  id: number;
  name: string;
  role: string;
  email: string | null;
  phone: string | null;
  status: StaffStatus;
  joinedAt: string;
  hourlyRate: number | null;
  branchId: number | null;
  /** True if this staff member also has an app login (Team Portal "Add Staff" can create one). */
  hasLogin: boolean;
  /** Base64 data URI (or external URL) — no blob storage service exists yet, see imagePicker.ts. */
  photoUrl: string | null;
  department: string | null;
  designation: string | null;
  salaryType: SalaryType;
  basicSalary: number | null;
}

/** Bank/Aadhaar/PAN never appear on ApiStaff (GET /staff is reachable by any role) —
 * only via staffApi.financialDetails, masked unless ?reveal=true. */
export interface StaffFinancialDetails {
  staffId: number;
  bankAccountNumber: string | null;
  bankIfsc: string | null;
  bankName: string | null;
  aadhaar: string | null;
  pan: string | null;
  revealed: boolean;
}

export interface UpdateStaffRequest {
  name?: string;
  role?: string;
  email?: string;
  phone?: string;
  hourlyRate?: number;
  branchId?: number;
  photoUrl?: string;
  department?: string;
  designation?: string;
  salaryType?: SalaryType;
  basicSalary?: number;
  bankAccountNumber?: string;
  bankIfsc?: string;
  bankName?: string;
  aadhaar?: string;
  pan?: string;
}

export interface CreateStaffRequest {
  name: string;
  role: string;
  email?: string;
  phone?: string;
  hourlyRate?: number;
  branchId?: number;
  /** Supply password + loginRole together (with a 10-digit phone) to also create a
   * real app login for this staff member, tied to the current cafe automatically.
   * Staff sign in with their mobile number, not email. */
  password?: string;
  loginRole?: LoginRole;
  department?: string;
  designation?: string;
  salaryType?: SalaryType;
  basicSalary?: number;
  bankAccountNumber?: string;
  bankIfsc?: string;
  bankName?: string;
  aadhaar?: string;
  pan?: string;
}

export interface Shift {
  id: number;
  staffId: number;
  startsAt: string;
  endsAt: string;
  notes: string | null;
}

export interface ShiftWithStaff extends Shift {
  staffName: string;
  staffRole: string;
}

/** Computed live from real Orders (Order.CreatedByUserId) and Shifts — not a manually
 * submitted review. attendanceRatePct is null when the staff member has no completed
 * shifts yet, since there's nothing real to measure it against. */
export interface StaffPerformanceSummary {
  staffId: number;
  staffName: string;
  staffRole: string;
  totalOrders: number;
  totalRevenue: number;
  attendanceRatePct: number | null;
}

export interface HourWindowStaffing {
  label: string;
  orderCount: number;
  staffScheduled: number;
  ordersPerStaff: number;
  status: 'Understaffed' | 'Overstaffed' | 'Balanced';
}

export interface ShiftOptimization {
  windows: HourWindowStaffing[];
  suggestions: string[];
}

export type LeaveType = 'Sick' | 'Casual' | 'Paid' | 'Unpaid';
export type LeaveRequestStatus = 'Pending' | 'Approved' | 'Rejected';

export interface LeaveRequest {
  id: number;
  staffId: number;
  staffName: string;
  startDate: string; // yyyy-MM-dd
  endDate: string;
  type: LeaveType;
  reason: string | null;
  status: LeaveRequestStatus;
  reviewedByName: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

export interface CreateLeaveRequest {
  staffId: number;
  startDate: string;
  endDate: string;
  type: LeaveType;
  reason?: string;
}

/** Self-service counterpart to CreateLeaveRequest — no staffId, the backend resolves
 * the caller's own linked staff roster row. */
export interface CreateMyLeaveRequest {
  startDate: string;
  endDate: string;
  type: LeaveType;
  reason?: string;
}

export type StaffAccessMode = 'Automatic' | 'Custom';

/** Automatic follows the role-based default (see core/auth/permissions.ts);
 * Custom uses only allowedScreens as the exact set of visible screens. */
export interface StaffScreenAccess {
  staffId: number;
  accessMode: StaffAccessMode;
  allowedScreens: string[];
  /** The login's AppRole — the Screen Access picker needs it to preview which screens
   * Automatic mode actually grants (isScreenInRoleDefault), not just say "role default". */
  role: string;
}

export interface UpdateStaffScreenAccessRequest {
  accessMode: StaffAccessMode;
  allowedScreens?: string[];
}

/** Which single kitchen station's KOTs this login's KDS is pinned to — null means no
 * server-side pin (KDS falls back to that device's own remembered station). */
export interface StaffKitchenAssignment {
  staffId: number;
  assignedStationId: number | null;
}

export interface UpdateStaffKitchenAssignmentRequest {
  assignedStationId: number | null;
}

const STATUS_TO_WIRE: Record<StaffStatus, string> = {
  ACTIVE: 'Active',
  SUSPENDED: 'Suspended',
  ON_LEAVE: 'OnLeave',
  TERMINATED: 'Terminated',
};

export const staffApi = {
  list: (branchId?: number) => apiClient.get<ApiStaff[]>('/staff', { params: { branchId } }).then((r) => r.data),
  /** The logged-in user's own StaffMember record, if any — 404s if this login isn't
   * linked to a roster entry. Powers the POS Checkout waiter picker's default. */
  me: () => apiClient.get<ApiStaff>('/staff/me').then((r) => r.data),
  create: (req: CreateStaffRequest) => apiClient.post<ApiStaff>('/staff', req).then((r) => r.data),
  update: (id: number, req: UpdateStaffRequest) => apiClient.patch<ApiStaff>(`/staff/${id}`, req).then((r) => r.data),
  updateStatus: (id: number, status: StaffStatus) =>
    apiClient.patch<ApiStaff>(`/staff/${id}/status`, { status: STATUS_TO_WIRE[status] }).then((r) => r.data),
  remove: (id: number) => apiClient.delete<void>(`/staff/${id}`).then((r) => r.data),
  resetPassword: (id: number, newPassword: string) =>
    apiClient.post<void>(`/staff/${id}/reset-password`, { newPassword }).then((r) => r.data),
  /** For a staff member created without app access — provisions a login for them
   * after the fact (StaffProfileScreen's "Give app access" action). */
  grantAccess: (id: number, req: { phone: string; password: string; loginRole: LoginRole }) =>
    apiClient.post<ApiStaff>(`/staff/${id}/grant-access`, req).then((r) => r.data),
  listShifts: (staffId: number) => apiClient.get<Shift[]>(`/staff/${staffId}/shifts`).then((r) => r.data),
  listAllShifts: (date: string) => apiClient.get<ShiftWithStaff[]>('/staff/shifts', { params: { date } }).then((r) => r.data),
  createShift: (staffId: number, startsAt: string, endsAt: string, notes?: string) =>
    apiClient.post<Shift>('/staff/shifts', { staffId, startsAt, endsAt, notes }).then((r) => r.data),
  removeShift: (shiftId: number) => apiClient.delete<void>(`/staff/shifts/${shiftId}`).then((r) => r.data),
  performance: (staffId: number) => apiClient.get<StaffPerformanceSummary>(`/staff/${staffId}/performance`).then((r) => r.data),
  /** Omit both bounds for all-time. periodStart/periodEnd are UTC ISO instants. */
  listAllPerformance: (periodStart?: string, periodEnd?: string) =>
    apiClient.get<StaffPerformanceSummary[]>('/staff/performance', { params: { periodStart, periodEnd } }).then((r) => r.data),
  financialDetails: (id: number, reveal = false) =>
    apiClient.get<StaffFinancialDetails>(`/staff/${id}/financial-details`, { params: { reveal } }).then((r) => r.data),
  shiftOptimization: (date?: string) =>
    apiClient.get<ShiftOptimization>('/staff/shift-optimization', { params: date ? { date } : undefined }).then((r) => r.data),
  listLeaveRequests: (status?: LeaveRequestStatus) =>
    apiClient.get<LeaveRequest[]>('/staff/leave-requests', { params: status ? { status } : undefined }).then((r) => r.data),
  createLeaveRequest: (req: CreateLeaveRequest) => apiClient.post<LeaveRequest>('/staff/leave-requests', req).then((r) => r.data),
  /** This login's own leave requests only — powers the self-service "My Leave" screen. */
  listMyLeaveRequests: (status?: LeaveRequestStatus) =>
    apiClient.get<LeaveRequest[]>('/staff/leave-requests/me', { params: status ? { status } : undefined }).then((r) => r.data),
  createMyLeaveRequest: (req: CreateMyLeaveRequest) => apiClient.post<LeaveRequest>('/staff/leave-requests/me', req).then((r) => r.data),
  approveLeaveRequest: (id: number) => apiClient.post<LeaveRequest>(`/staff/leave-requests/${id}/approve`).then((r) => r.data),
  rejectLeaveRequest: (id: number, note?: string) =>
    apiClient.post<LeaveRequest>(`/staff/leave-requests/${id}/reject`, { note }).then((r) => r.data),
  returnToWork: (id: number) => apiClient.post<LeaveRequest>(`/staff/leave-requests/${id}/return-to-work`).then((r) => r.data),
  getScreenAccess: (id: number) => apiClient.get<StaffScreenAccess>(`/staff/${id}/screen-access`).then((r) => r.data),
  updateScreenAccess: (id: number, req: UpdateStaffScreenAccessRequest) =>
    apiClient.patch<StaffScreenAccess>(`/staff/${id}/screen-access`, req).then((r) => r.data),
  getKitchenAssignment: (id: number) => apiClient.get<StaffKitchenAssignment>(`/staff/${id}/kitchen-assignment`).then((r) => r.data),
  updateKitchenAssignment: (id: number, req: UpdateStaffKitchenAssignmentRequest) =>
    apiClient.patch<StaffKitchenAssignment>(`/staff/${id}/kitchen-assignment`, req).then((r) => r.data),
};
