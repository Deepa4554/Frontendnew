import React from 'react';
import { fireEvent, waitFor, within } from '@testing-library/react-native';
import { renderWithProviders } from '../../../../../test-utils';
import { AttendanceScreen } from './AttendanceScreen';

// Same network-boundary-only mocking approach as AttendanceScreen.rollCall.test.tsx,
// but with Morning + Evening turned on in Settings so the shift-tab row actually shows
// up — this covers the part rollCall.test.tsx deliberately keeps out of scope (only
// General enabled there, so no tabs render at all).
type MockRecord = {
  id: number;
  staffId: number;
  staffName: string;
  date: string;
  shiftKind: string;
  shiftId: number | null;
  punchInAt: string | null;
  punchOutAt: string | null;
  breakMinutes: number;
  workedMinutes: number | null;
  status: string;
  lateMinutes: number;
  overtimeMinutes: number;
  isManuallyEdited: boolean;
  editNote: string | null;
};

let mockRecords: MockRecord[] = [];
let mockNextRecordId = 1;
const mockList = jest.fn();
const mockMark = jest.fn();

jest.mock('../../../../../core/api/staffApi', () => ({
  staffApi: {
    list: jest.fn(async () => [{ id: 1, name: 'Asha Rao', role: 'Barista', status: 'ACTIVE' }]),
  },
}));

jest.mock('../../../../../core/api/settingsApi', () => ({
  settingsApi: {
    get: jest.fn(async () => ({
      morningShiftEnabled: true,
      eveningShiftEnabled: true,
      nightShiftEnabled: false,
      generalShiftEnabled: false,
    })),
  },
}));

jest.mock('../../../../../core/api/attendanceApi', () => ({
  attendanceApi: {
    list: jest.fn(async (params: { shiftKind?: string }) => {
      mockList(params);
      return mockRecords.filter((r) => !params.shiftKind || r.shiftKind === params.shiftKind.toUpperCase());
    }),
    createManual: jest.fn(),
    correct: jest.fn(),
    mark: jest.fn(async (req: { date: string; entries: { staffId: number; status: string }[]; shiftKind?: string }) => {
      mockMark(req);
      const shiftKind = (req.shiftKind ?? 'General').toUpperCase();
      const marked = req.entries.map((entry) => {
        const existing = mockRecords.find((r) => r.staffId === entry.staffId && r.shiftKind === shiftKind);
        const record: MockRecord = existing ?? {
          id: mockNextRecordId++,
          staffId: entry.staffId,
          staffName: 'Asha Rao',
          date: req.date,
          shiftKind,
          shiftId: null,
          punchInAt: null,
          punchOutAt: null,
          breakMinutes: 0,
          workedMinutes: null,
          status: 'PRESENT',
          lateMinutes: 0,
          overtimeMinutes: 0,
          isManuallyEdited: true,
          editNote: 'Marked by test',
        };
        if (!existing) mockRecords = [...mockRecords, record];
        return record;
      });
      return marked;
    }),
  },
}));

beforeEach(() => {
  mockRecords = [];
  mockNextRecordId = 1;
  mockList.mockClear();
  mockMark.mockClear();
});

describe('AttendanceScreen shift tabs', () => {
  it('shows a tab per shift enabled in Settings, defaulting to the first one', async () => {
    const { getByTestId } = await renderWithProviders(<AttendanceScreen />);

    await waitFor(() => expect(getByTestId('attendance-shift-tabs')).toBeTruthy());
    expect(getByTestId('shift-tab-Morning')).toBeTruthy();
    expect(getByTestId('shift-tab-Evening')).toBeTruthy();
  });

  it('marking a staff member present on one shift tab does not affect another shift tab', async () => {
    const { getByTestId, queryByTestId } = await renderWithProviders(<AttendanceScreen />);

    await waitFor(() => expect(getByTestId('mark-1-Present')).toBeTruthy());
    fireEvent.press(getByTestId('mark-1-Present'));
    await waitFor(() =>
      expect(within(getByTestId('attendance-row-1')).getByTestId('attendance-status-badge')).toHaveTextContent('Present'),
    );

    // Switch to the Evening tab — the same staff member should read as unmarked there,
    // since the Morning mark landed on a separate AttendanceRecord (different ShiftKind).
    fireEvent.press(getByTestId('shift-tab-Evening'));
    await waitFor(() => expect(mockList).toHaveBeenLastCalledWith(expect.objectContaining({ shiftKind: 'Evening' })));
    await waitFor(() => expect(queryByTestId('attendance-status-badge')).toBeNull());

    fireEvent.press(getByTestId('mark-1-Absent'));
    await waitFor(() =>
      expect(within(getByTestId('attendance-row-1')).getByTestId('attendance-status-badge')).toHaveTextContent('Absent'),
    );

    // Both shift's records exist independently — Morning is still Present.
    expect(mockRecords.find((r) => r.shiftKind === 'MORNING')?.status).toBe('PRESENT');
    expect(mockRecords.find((r) => r.shiftKind === 'EVENING')?.status).toBe('ABSENT');
  });

  it('the manual-entry modal offers a shift picker when 2+ shifts are enabled', async () => {
    const { getByTestId } = await renderWithProviders(<AttendanceScreen />);

    await waitFor(() => expect(getByTestId('attendance-shift-tabs')).toBeTruthy());
    fireEvent.press(getByTestId('shift-tab-Evening'));
    await waitFor(() => expect(mockList).toHaveBeenLastCalledWith(expect.objectContaining({ shiftKind: 'Evening' })));

    fireEvent.press(getByTestId('attendance-fab'));
    await waitFor(() => expect(getByTestId('manual-shift-Evening')).toBeTruthy());
    expect(getByTestId('manual-shift-Morning')).toBeTruthy();
  });
});
