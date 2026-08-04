import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { approvalsApi, ApprovalStatus, SubmitApprovalRequest } from '../approvalsApi';
import { queryKeys } from './queryKeys';

/** `enabled: false` skips the fetch entirely — used by MoreScreen/DesktopAppShell, which
 * only want the pending-count badge and shouldn't call an endpoint the login has no
 * Approvals access to (ApprovalsController is [RequireScreen("Approvals")] server-side). */
export const useApprovals = (
  params?: { status?: ApprovalStatus; assignedToId?: number },
  options?: { enabled?: boolean },
) =>
  useQuery({
    queryKey: queryKeys.approvals(params),
    queryFn: () => approvalsApi.list(params),
    enabled: options?.enabled ?? true,
  });

export const useSubmitApproval = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: SubmitApprovalRequest) => approvalsApi.submit(req),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['approvals'] }),
  });
};

export const useApproveRequest = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, notes }: { id: number; notes?: string }) => approvalsApi.approve(id, notes),
    // Approving a Leave-type request also flips StaffMember.Status server-side
    // (ApprovalsController) — invalidate staff + leave-requests so Team Portal's
    // On Leave cards and the Leave screen pick up the change too.
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['approvals'] });
      qc.invalidateQueries({ queryKey: ['staff'] });
      qc.invalidateQueries({ queryKey: ['leave-requests'] });
    },
  });
};

export const useRejectRequest = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, notes }: { id: number; notes?: string }) => approvalsApi.reject(id, notes),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['approvals'] });
      qc.invalidateQueries({ queryKey: ['staff'] });
      qc.invalidateQueries({ queryKey: ['leave-requests'] });
    },
  });
};

export const useEscalateRequest = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => approvalsApi.escalate(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['approvals'] }),
  });
};
