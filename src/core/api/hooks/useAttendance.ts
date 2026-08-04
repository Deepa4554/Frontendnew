import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { attendanceApi, PunchRequest, ManualAttendanceRequest, CorrectAttendanceRequest } from '../attendanceApi';
import { queryKeys } from './queryKeys';

const invalidateAttendance = (qc: ReturnType<typeof useQueryClient>) => {
  qc.invalidateQueries({ queryKey: ['attendance'] });
};

export const useMyAttendance = (periodStart?: string, periodEnd?: string) =>
  useQuery({ queryKey: queryKeys.myAttendance(periodStart, periodEnd), queryFn: () => attendanceApi.me(periodStart, periodEnd) });

export const usePunchIn = () => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (req: PunchRequest) => attendanceApi.punchIn(req), onSuccess: () => invalidateAttendance(qc) });
};

export const usePunchOut = () => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (req: PunchRequest) => attendanceApi.punchOut(req), onSuccess: () => invalidateAttendance(qc) });
};

export const useBreakStart = () => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (req: PunchRequest) => attendanceApi.breakStart(req), onSuccess: () => invalidateAttendance(qc) });
};

export const useBreakEnd = () => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (req: PunchRequest) => attendanceApi.breakEnd(req), onSuccess: () => invalidateAttendance(qc) });
};

export const useAttendanceList = (params: { staffId?: number; date?: string; periodStart?: string; periodEnd?: string }) =>
  useQuery({ queryKey: queryKeys.attendance(params), queryFn: () => attendanceApi.list(params) });

export const useCreateManualAttendance = () => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (req: ManualAttendanceRequest) => attendanceApi.createManual(req), onSuccess: () => invalidateAttendance(qc) });
};

export const useCorrectAttendance = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, req }: { id: number; req: CorrectAttendanceRequest }) => attendanceApi.correct(id, req),
    onSuccess: () => invalidateAttendance(qc),
  });
};
