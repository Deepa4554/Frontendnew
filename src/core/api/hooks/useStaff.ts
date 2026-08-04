import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { staffApi, CreateStaffRequest, UpdateStaffRequest, StaffStatus, CreateLeaveRequest, CreateMyLeaveRequest, LeaveRequestStatus, UpdateStaffScreenAccessRequest, UpdateStaffKitchenAssignmentRequest, LoginRole } from '../staffApi';
import { queryKeys } from './queryKeys';

export const useStaff = (branchId?: number) => useQuery({ queryKey: queryKeys.staff(branchId), queryFn: () => staffApi.list(branchId) });

/** The logged-in user's own StaffMember record, if any. A 404 (no linked roster
 * entry) or 403 (Basic-plan tenant — Team Management is Plus-only) are both
 * expected non-error outcomes here, so this never retries. */
export const useMyStaffRecord = () => useQuery({ queryKey: ['staff', 'me'], queryFn: staffApi.me, retry: false });

export const useCreateStaff = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: CreateStaffRequest) => staffApi.create(req),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['staff'] }),
  });
};

export const useUpdateStaff = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, req }: { id: number; req: UpdateStaffRequest }) => staffApi.update(id, req),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['staff'] }),
  });
};

export const useUpdateStaffStatus = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: number; status: StaffStatus }) => staffApi.updateStatus(id, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['staff'] }),
  });
};

export const useDeleteStaff = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => staffApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['staff'] }),
  });
};

export const useResetStaffPassword = () =>
  useMutation({
    mutationFn: ({ id, newPassword }: { id: number; newPassword: string }) => staffApi.resetPassword(id, newPassword),
  });

export const useGrantStaffAccess = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, req }: { id: number; req: { email: string; password: string; loginRole: LoginRole } }) =>
      staffApi.grantAccess(id, req),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['staff'] }),
  });
};

export const useShifts = (staffId: number | null, enabled: boolean = true) =>
  useQuery({ queryKey: queryKeys.shifts(staffId ?? -1), queryFn: () => staffApi.listShifts(staffId as number), enabled: staffId !== null && enabled });

/** All shifts across every staff member for one calendar day — powers the Team
 * Schedule day view. `date` should be an ISO date/datetime string. */
export const useAllShifts = (date: string) =>
  useQuery({ queryKey: queryKeys.allShifts(date.slice(0, 10)), queryFn: () => staffApi.listAllShifts(date) });

export const useCreateShift = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ staffId, startsAt, endsAt, notes }: { staffId: number; startsAt: string; endsAt: string; notes?: string }) =>
      staffApi.createShift(staffId, startsAt, endsAt, notes),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['staff'] }),
  });
};

export const useDeleteShift = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (shiftId: number) => staffApi.removeShift(shiftId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['staff'] }),
  });
};

/** Live-computed snapshot (orders, revenue, attendance) for one staff member — not a
 * list of past reviews, there's only ever the current real numbers. `enabled` should
 * be false for staff with no app login (the backend has nothing to compute for them). */
export const usePerformance = (staffId: number | null, enabled: boolean = true) =>
  useQuery({
    queryKey: queryKeys.performance(staffId ?? -1),
    queryFn: () => staffApi.performance(staffId as number),
    enabled: staffId !== null && enabled,
  });

/** Every staff member's live performance, ranked by revenue — powers the Performance
 * Reports leaderboard. Omit both bounds for all-time. */
export const useAllPerformance = (periodStart?: string, periodEnd?: string) =>
  useQuery({
    queryKey: [...queryKeys.allPerformance, periodStart ?? 'all', periodEnd ?? 'all'],
    queryFn: () => staffApi.listAllPerformance(periodStart, periodEnd),
  });

/** Full masked-or-revealed bank/Aadhaar/PAN — see StaffFinancialDetails. Revealing
 * writes a backend audit entry, so this only fetches with reveal=true on an explicit
 * user action, never on screen mount. */
export const useStaffFinancialDetails = (staffId: number | null, reveal: boolean, enabled: boolean = true) =>
  useQuery({
    queryKey: ['staff', staffId ?? -1, 'financial-details', reveal],
    queryFn: () => staffApi.financialDetails(staffId as number, reveal),
    enabled: staffId !== null && enabled,
  });

/** Real staffing-vs-typical-demand comparison for a given day (defaults to today). */
export const useShiftOptimization = (date?: string) =>
  useQuery({ queryKey: queryKeys.shiftOptimization(date ?? 'today'), queryFn: () => staffApi.shiftOptimization(date) });

export const useLeaveRequests = (status?: LeaveRequestStatus) =>
  useQuery({ queryKey: queryKeys.leaveRequests(status), queryFn: () => staffApi.listLeaveRequests(status) });

const invalidateLeaveRequests = (qc: ReturnType<typeof useQueryClient>) => {
  qc.invalidateQueries({ queryKey: ['leave-requests'] });
  qc.invalidateQueries({ queryKey: ['staff'] }); // approving/returning flips StaffMember.Status too
};

export const useCreateLeaveRequest = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: CreateLeaveRequest) => staffApi.createLeaveRequest(req),
    onSuccess: () => invalidateLeaveRequests(qc),
  });
};

export const useApproveLeaveRequest = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => staffApi.approveLeaveRequest(id),
    onSuccess: () => invalidateLeaveRequests(qc),
  });
};

export const useRejectLeaveRequest = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, note }: { id: number; note?: string }) => staffApi.rejectLeaveRequest(id, note),
    onSuccess: () => invalidateLeaveRequests(qc),
  });
};

export const useReturnToWork = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => staffApi.returnToWork(id),
    onSuccess: () => invalidateLeaveRequests(qc),
  });
};

/** This login's own leave requests only — powers the self-service "My Leave" screen. */
export const useMyLeaveRequests = (status?: LeaveRequestStatus) =>
  useQuery({ queryKey: queryKeys.myLeaveRequests(status), queryFn: () => staffApi.listMyLeaveRequests(status) });

export const useCreateMyLeaveRequest = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: CreateMyLeaveRequest) => staffApi.createMyLeaveRequest(req),
    onSuccess: () => invalidateLeaveRequests(qc),
  });
};

/** 404s (via getApiErrorMessage's normal error path) when this staff member has no
 * app login yet — the Staff Access screen shows a "no login" state instead of a picker
 * in that case. `enabled` lets the caller wait until a valid staffId (and hasLogin) is known. */
export const useStaffScreenAccess = (staffId: number | null, enabled: boolean = true) =>
  useQuery({
    queryKey: ['staff', staffId ?? -1, 'screen-access'],
    queryFn: () => staffApi.getScreenAccess(staffId as number),
    enabled: staffId !== null && enabled,
    retry: false,
  });

export const useUpdateStaffScreenAccess = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, req }: { id: number; req: UpdateStaffScreenAccessRequest }) => staffApi.updateScreenAccess(id, req),
    onSuccess: (_data, { id }) => qc.invalidateQueries({ queryKey: ['staff', id, 'screen-access'] }),
  });
};

/** 404s (via getApiErrorMessage's normal error path) when this staff member has no
 * app login yet — mirrors useStaffScreenAccess above. */
export const useStaffKitchenAssignment = (staffId: number | null, enabled: boolean = true) =>
  useQuery({
    queryKey: ['staff', staffId ?? -1, 'kitchen-assignment'],
    queryFn: () => staffApi.getKitchenAssignment(staffId as number),
    enabled: staffId !== null && enabled,
    retry: false,
  });

export const useUpdateStaffKitchenAssignment = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, req }: { id: number; req: UpdateStaffKitchenAssignmentRequest }) => staffApi.updateKitchenAssignment(id, req),
    onSuccess: (_data, { id }) => qc.invalidateQueries({ queryKey: ['staff', id, 'kitchen-assignment'] }),
  });
};
