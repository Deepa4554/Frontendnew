import { apiClient } from '../network/api';

export type AttendanceStatus = 'PRESENT' | 'LATE' | 'HALF_DAY' | 'ABSENT' | 'ON_LEAVE' | 'HOLIDAY';

export interface AttendanceRecord {
  id: number;
  staffId: number;
  staffName: string;
  date: string; // yyyy-MM-dd
  shiftId: number | null;
  punchInAt: string | null;
  punchOutAt: string | null;
  breakMinutes: number;
  workedMinutes: number | null;
  status: AttendanceStatus;
  lateMinutes: number;
  overtimeMinutes: number;
  isManuallyEdited: boolean;
  editNote: string | null;
}

export interface PunchRequest {
  localDate: string; // yyyy-MM-dd
  occurredAt?: string;
  latitude?: number;
  longitude?: number;
}

export interface ManualAttendanceRequest {
  staffId: number;
  date: string;
  punchInAt?: string;
  punchOutAt?: string;
  breakMinutes: number;
  editNote: string;
}

/** The enum names the API deserializes (PascalCase), as opposed to the SCREAMING_CASE
 * `AttendanceStatus` it serializes back on AttendanceRecord — same asymmetry as
 * CorrectAttendanceRequest.status. */
export type MarkAttendanceStatus = 'Present' | 'HalfDay' | 'Absent' | 'OnLeave' | 'Holiday';

/** One-tap roll-call marking — no times, no note (the server derives both). Batched so
 * "Mark all present" is a single request. */
export interface MarkAttendanceRequest {
  date: string; // yyyy-MM-dd
  entries: { staffId: number; status: MarkAttendanceStatus }[];
}

export interface CorrectAttendanceRequest {
  punchInAt?: string;
  punchOutAt?: string;
  breakMinutes?: number;
  status?: 'Present' | 'Late' | 'HalfDay' | 'Absent' | 'OnLeave' | 'Holiday';
  editNote: string;
}

export const attendanceApi = {
  punchIn: (req: PunchRequest) => apiClient.post<AttendanceRecord>('/attendance/punch-in', req).then((r) => r.data),
  punchOut: (req: PunchRequest) => apiClient.post<AttendanceRecord>('/attendance/punch-out', req).then((r) => r.data),
  breakStart: (req: PunchRequest) => apiClient.post<void>('/attendance/break-start', req).then((r) => r.data),
  breakEnd: (req: PunchRequest) => apiClient.post<AttendanceRecord>('/attendance/break-end', req).then((r) => r.data),
  me: (periodStart?: string, periodEnd?: string) =>
    apiClient.get<AttendanceRecord[]>('/attendance/me', { params: { periodStart, periodEnd } }).then((r) => r.data),
  list: (params: { staffId?: number; date?: string; periodStart?: string; periodEnd?: string }) =>
    apiClient.get<AttendanceRecord[]>('/attendance', { params }).then((r) => r.data),
  get: (id: number) => apiClient.get<AttendanceRecord>(`/attendance/${id}`).then((r) => r.data),
  createManual: (req: ManualAttendanceRequest) => apiClient.post<AttendanceRecord>('/attendance/manual', req).then((r) => r.data),
  mark: (req: MarkAttendanceRequest) => apiClient.post<AttendanceRecord[]>('/attendance/mark', req).then((r) => r.data),
  correct: (id: number, req: CorrectAttendanceRequest) => apiClient.patch<AttendanceRecord>(`/attendance/${id}`, req).then((r) => r.data),
};
