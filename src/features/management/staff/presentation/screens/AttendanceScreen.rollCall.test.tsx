import React from 'react';
import { fireEvent, waitFor, within } from '@testing-library/react-native';
import { renderWithProviders } from '../../../../../test-utils';
import { AttendanceScreen } from './AttendanceScreen';

// Only the network boundary is faked — useStaff/useAttendanceList/useMarkAttendance and
// the real QueryClient cache invalidation all run for real, so this exercises the actual
// "tap a chip -> record appears on the row" round trip rather than a scripted mock of it.
type MockRecord = {
  id: number;
  staffId: number;
  staffName: string;
  date: string;
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
const mockMark = jest.fn();

const STATUS_FROM_MARK: Record<string, string> = {
  Present: 'PRESENT',
  HalfDay: 'HALF_DAY',
  OnLeave: 'ON_LEAVE',
  Absent: 'ABSENT',
  Holiday: 'HOLIDAY',
};

jest.mock('../../../../../core/api/staffApi', () => ({
  staffApi: {
    list: jest.fn(async () => [
      { id: 1, name: 'Asha Rao', role: 'Barista', status: 'ACTIVE' },
      { id: 2, name: 'Vikram Shah', role: 'Waiter', status: 'ACTIVE' },
      { id: 3, name: 'Old Hire', role: 'Cleaner', status: 'TERMINATED' },
    ]),
  },
}));

jest.mock('../../../../../core/api/attendanceApi', () => ({
  attendanceApi: {
    list: jest.fn(async () => mockRecords),
    createManual: jest.fn(),
    correct: jest.fn(),
    mark: jest.fn(async (req: { date: string; entries: { staffId: number; status: string }[] }) => {
      mockMark(req);
      const names: Record<number, string> = { 1: 'Asha Rao', 2: 'Vikram Shah' };
      const marked = req.entries.map((entry) => {
        const existing = mockRecords.find((r) => r.staffId === entry.staffId);
        const record: MockRecord = existing ?? {
          id: mockNextRecordId++,
          staffId: entry.staffId,
          staffName: names[entry.staffId],
          date: req.date,
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
        record.status = STATUS_FROM_MARK[entry.status];
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
  mockMark.mockClear();
});

describe('AttendanceScreen roll call', () => {
  it('lists every roster staff member — marked or not — and leaves out ex-staff', async () => {
    const { getByText, queryByText, getByTestId } = await renderWithProviders(<AttendanceScreen />);

    await waitFor(() => expect(getByText('Asha Rao')).toBeTruthy());
    expect(getByTestId('attendance-row-2')).toBeTruthy();
    expect(queryByText('Old Hire')).toBeNull();
    // Nobody has punched, so both rows sit in the unmarked state.
    await waitFor(() => expect(getByText(/2 not marked/)).toBeTruthy());
  });

  it('marks one staff member present with a single tap', async () => {
    const { getByTestId } = await renderWithProviders(<AttendanceScreen />);

    await waitFor(() => expect(getByTestId('mark-1-Present')).toBeTruthy());
    fireEvent.press(getByTestId('mark-1-Present'));

    await waitFor(() =>
      expect(mockMark).toHaveBeenCalledWith(expect.objectContaining({ entries: [{ staffId: 1, status: 'Present' }] })),
    );
    // The row picks the new status up from the refetched list, not from local state.
    await waitFor(() =>
      expect(within(getByTestId('attendance-row-1')).getByTestId('attendance-status-badge')).toHaveTextContent('Present'),
    );
  });

  it('marks a staff member on leave without touching anyone else', async () => {
    const { getByTestId } = await renderWithProviders(<AttendanceScreen />);

    await waitFor(() => expect(getByTestId('mark-2-OnLeave')).toBeTruthy());
    fireEvent.press(getByTestId('mark-2-OnLeave'));

    await waitFor(() =>
      expect(within(getByTestId('attendance-row-2')).getByTestId('attendance-status-badge')).toHaveTextContent('On Leave'),
    );
    expect(mockMark).toHaveBeenCalledTimes(1);
    expect(mockRecords.find((r) => r.staffId === 1)).toBeUndefined();
  });

  it('"Mark rest present" only fills in the staff nobody has marked yet', async () => {
    const { getByTestId } = await renderWithProviders(<AttendanceScreen />);

    await waitFor(() => expect(getByTestId('mark-1-Absent')).toBeTruthy());
    fireEvent.press(getByTestId('mark-1-Absent'));
    await waitFor(() =>
      expect(within(getByTestId('attendance-row-1')).getByTestId('attendance-status-badge')).toHaveTextContent('Absent'),
    );

    fireEvent.press(getByTestId('mark-rest-present'));

    await waitFor(() =>
      expect(mockMark).toHaveBeenLastCalledWith(expect.objectContaining({ entries: [{ staffId: 2, status: 'Present' }] })),
    );
    // The one already marked Absent keeps its status.
    expect(mockRecords.find((r) => r.staffId === 1)?.status).toBe('ABSENT');
  });
});
