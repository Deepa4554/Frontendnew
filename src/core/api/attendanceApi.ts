import { apiClient } from '../network/api';

export type AttendanceStatus = 'PRESENT' | 'LATE' | 'HALF_DAY' | 'ABSENT' | 'ON_LEAVE' | 'HOLIDAY';

/** The 4 fixed, cafe-wide attendance shifts an Owner turns on/off in Settings (see
 * ApiSettings.morningShiftEnabled etc.) — SCREAMING_CASE as deserialized on
 * AttendanceRecord, PascalCase (`ShiftKindOption`) as sent in requests, same asymmetry
 * as AttendanceStatus/MarkAttendanceStatus below. */
export type ShiftKind = 'MORNING' | 'EVENING' | 'NIGHT' | 'GENERAL';
export type ShiftKindOption = 'Morning' | 'Evening' | 'Night' | 'General';

export interface AttendanceRecord {
  id: number;
  staffId: number;
  staffName: string;
  date: string; // yyyy-MM-dd
  shiftKind: ShiftKind;
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
  shiftKind?: ShiftKindOption;
}

export interface ManualAttendanceRequest {
  staffId: number;
  date: string;
  punchInAt?: string;
  punchOutAt?: string;
  breakMinutes: number;
  editNote: string;
  shiftKind?: ShiftKindOption;
}

/** The enum names the API deserializes (PascalCase), as opposed to the SCREAMING_CASE
 * `AttendanceStatus` it serializes back on AttendanceRecord — same asymmetry as
 * CorrectAttendanceRequest.status. */
export type MarkAttendanceStatus = 'Present' | 'HalfDay' | 'Absent' | 'OnLeave' | 'Holiday';

/** One-tap roll-call marking — no times, no note (the server derives both). Batched so
 * "Mark all present" is a single request. shiftKind is request-level, not per-entry —
 * the Attendance screen's shift tab scopes the whole roster to one shift at a time,
 * same scope as date; omitted defaults to General server-side. */
export interface MarkAttendanceRequest {
  date: string; // yyyy-MM-dd
  entries: { staffId: number; status: MarkAttendanceStatus }[];
  shiftKind?: ShiftKindOption;
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
  list: (params: { staffId?: number; date?: string; periodStart?: string; periodEnd?: string; shiftKind?: ShiftKindOption }) =>
    apiClient.get<AttendanceRecord[]>('/attendance', { params }).then((r) => r.data),
  get: (id: number) => apiClient.get<AttendanceRecord>(`/attendance/${id}`).then((r) => r.data),
  createManual: (req: ManualAttendanceRequest) => apiClient.post<AttendanceRecord>('/attendance/manual', req).then((r) => r.data),
  mark: (req: MarkAttendanceRequest) => apiClient.post<AttendanceRecord[]>('/attendance/mark', req).then((r) => r.data),
  correct: (id: number, req: CorrectAttendanceRequest) => apiClient.patch<AttendanceRecord>(`/attendance/${id}`, req).then((r) => r.data),
};
